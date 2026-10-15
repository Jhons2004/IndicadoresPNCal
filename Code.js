// ====================================
// CODE.GS - SISTEMA DSNC SIN TOKEN EN URL
// Login por credenciales + validación backend en cada llamada
// Compatible con: login.html, administrativo.html, CENAME.html, COGUANOR.html, CRETEC.html, OGA_modulo.gs, CENAME_Excel.gs
// ====================================

const CONFIG = {
  SPREADSHEET_ID_USUARIOS:    '1o4y4aGrAmSshnl0D7yF_Eri0VDZVnIL8SThIeibKNGU',
  SPREADSHEET_ID_OGA:         '1Mywtx5VxzV06SU9PjnBBDda8vDBoaqr_QOBLFTPpLP8',
  SPREADSHEET_ID_INDICADORES: '1EPThZen3zVh-ghVSR5URpn7Sh6qf9xXzxJvCUpjXUm0',

  SHEETS: {
    USUARIOS:      'Usuario',
    LOGS_ACCESO:   'Logs_Acceso',
    COGUANOR:      'COGUANOR',
    CENAME:        'CENAME',
    CRETEC:        'CRETEC',
    EMAILS_CONFIG: 'Emails_Config'
  },

  EMAIL: {
    FROM:             'info@dsnc.gob.gt',
    GOOGLE_SITES_URL: 'https://sites.google.com/dsnc.gob.gt/pncal/pncal'
  }
};

/**
 * IDs por entorno. En QA se exigen copias de todas las hojas.
 * Producción conserva IDs actuales para no interrumpir integraciones publicadas.
 * ScriptProperties QA: PNCAL_QA_MODE=true, PNCAL_SHEET_USUARIOS,
 * PNCAL_SHEET_INDICADORES y PNCAL_SHEET_OGA.
 */
function pncalSpreadsheetId_(kind) {
  kind=String(kind||'').toUpperCase();
  var allowed=['USUARIOS','INDICADORES','OGA'];
  if (allowed.indexOf(kind)<0) throw new Error('Tipo de hoja no reconocido: '+kind);
  var props=PropertiesService.getScriptProperties();
  var configured=String(props.getProperty('PNCAL_SHEET_'+kind)||'').trim();
  var isQA=String(props.getProperty('PNCAL_QA_MODE')||'').toLowerCase()==='true';
  if (isQA && !configured) {
    throw new Error('QA sin configurar: cree PNCAL_SHEET_'+kind+' con el ID de una hoja de pruebas.');
  }
  return configured || CONFIG['SPREADSHEET_ID_'+kind];
}

const DEPARTMENT_CONFIG = {
  DSNC:     { page: 'administrativo', name: 'Dirección de Sistemas de Normalización y Certificación', color: '#5D5CDE' },
  OGA:      { page: 'administrativo', name: 'Oficina Guatemalteca de Acreditación', color: '#EF4444' },
  COGUANOR: { page: 'COGUANOR',       name: 'Comisión Guatemalteca de Normas', color: '#8B5CF6' },
  CENAME:   { page: 'CENAME',         name: 'Centro Nacional de Metrología', color: '#10B981' },
  CRETEC:   { page: 'CRETEC',         name: 'Comité Nacional de Reglamentación Técnica', color: '#F59E0B' }
};

var OGA_ACTIONS = [
  'OGA_GET_COMPILADO',
  'OGA_GET_CLIENTES',
  'OGA_GET_SITIOS',
  'OGA_GET_CICLOS',
  'OGA_GET_EVENTOS',
  'OGA_GET_TABLERO',
  'OGA_GET_DASHBOARD'
];

var CENAME_EXTERNAL_ACTIONS = [
  'CENAME_HEALTH',
  'CENAME_SYNC_JSON',
  'CENAME_GET_JSON'
];

// ====================================
// ENTRADAS PRINCIPALES
// ====================================

function doGet(e) {
  return handleRequest(e || {});
}

function doPost(e) {
  return handleRequest(e || {});
}

function handleRequest(e) {
  try {
    e = e || {};
    e.parameter = e.parameter || {};

    var page = String(e.parameter.page || 'login').trim();
    var action = String(e.parameter.action || '').trim();
    var callback = String(e.parameter.callback || '').trim();

    // Para POST JSON, action normalmente viene en el cuerpo y no en e.parameter.
    if (!action && e.postData && e.postData.contents) {
      try {
        var requestBody = JSON.parse(e.postData.contents);
        if (requestBody && !Array.isArray(requestBody)) {
          action = String(requestBody.action || '').trim();
          callback = callback || String(requestBody.callback || '').trim();
        }
      } catch (bodyError) {
        Logger.log('[handleRequest] Cuerpo POST no JSON: ' + bodyError.message);
      }
    }

    Logger.log('[handleRequest] page=' + page + ' action=' + action + ' callback=' + callback);

    if (callback) return handleJSONPRequest(e);
    if (action) return handleAPIRequest(e);

    return servePage(page, e.parameter || {});
  } catch (error) {
    Logger.log('[handleRequest][ERROR] ' + error.message + '\n' + (error.stack || ''));
    return createErrorResponse('Error: ' + error.message, 500);
  }
}

function getAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return PropertiesService.getScriptProperties().getProperty('APP_URL') || '';
  }
}

// ====================================
// PÁGINAS
// ====================================

function servePage(pageName, params) {
  params = params || {};

  var allowed = ['login', 'administrativo', 'OGA', 'CENAME', 'COGUANOR', 'CRETEC'];
  pageName = String(pageName || 'login').trim();
  if (allowed.indexOf(pageName) < 0) pageName = 'login';

  try {
    var template = HtmlService.createTemplateFromFile(pageName);

    // Inyección segura para todos los HTML, incluso si ya no usan token.
    template.appUrl = getAppUrl();
    template.page = pageName;
    template.pageParams = params || {};
    template.user = {};
    template.token = '';
    template.sessionToken = '';
    template.sessionValid = false;

    return template.evaluate()
      .setTitle('Sistema DSNC - ' + pageName)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    Logger.log('[servePage][ERROR] ' + pageName + ': ' + error.message + '\n' + (error.stack || ''));
    return createErrorResponse('Error al cargar: ' + error.message, 500);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ====================================
// LOGIN SIN TOKEN
// ====================================

function dsncLogin(username, password) {
  return authenticateUserByCredentials_(username, password);
}

function authenticateUserByCredentials_(username, password) {
  try {
    username = String(username || '').trim().toLowerCase();
    password = String(password || '').trim();

    if (!username || !password) {
      return { success: false, message: 'Usuario y contraseña requeridos.' };
    }

    var user = findUserByCredentials_(username, password);
    if (!user) {
      return { success: false, message: 'Credenciales incorrectas.' };
    }

    if (String(user.status || '').trim() !== 'Activo') {
      return { success: false, message: 'Usuario inactivo. Contacte al administrador.' };
    }

    var targetPage = resolveTargetPage_(user);
    user.targetPage = targetPage;

    updateLastAccessByUsername_(username);
    logActivity(user, 'LOGIN', user.department + ' -> ' + targetPage);

    return {
      success: true,
      message: 'Autenticación exitosa.',
      appUrl: getAppUrl(),
      page: targetPage,
      targetPage: targetPage,
      redirectUrl: getAppUrl() + '?page=' + encodeURIComponent(targetPage),
      user: user
    };
  } catch (error) {
    Logger.log('[authenticateUserByCredentials_][ERROR] ' + error.message + '\n' + (error.stack || ''));
    return { success: false, message: 'Error de autenticación: ' + error.message };
  }
}

function findUserByCredentials_(username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '').trim();

  var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
  var sheet = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
  if (!sheet) throw new Error('No existe la hoja de usuarios: ' + CONFIG.SHEETS.USUARIOS);

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var cleanUser = String(row[0] || '').trim().toLowerCase();
    var cleanPass = String(row[1] || '').trim();

    if (cleanUser === username && cleanPass === password) {
      var dept = String(row[2] || '').trim();
      var role = String(row[3] || '').trim();
      var status = String(row[4] || '').trim();

      return {
        username: cleanUser,
        name: getDisplayName(cleanUser, dept),
        email: String(row[6] || '').trim(),
        department: dept,
        role: role,
        status: status
      };
    }
  }

  return null;
}

function validateCredentialAuth_(auth, requireAdmin) {
  try {
    auth = normalizeAuth_(auth);

    if (!auth.username || !auth.password) {
      return { valid: false, reason: 'No hay credenciales de sesión.' };
    }

    var user = findUserByCredentials_(auth.username, auth.password);
    if (!user) {
      return { valid: false, reason: 'Credenciales inválidas.' };
    }

    if (String(user.status || '').trim() !== 'Activo') {
      return { valid: false, reason: 'Usuario inactivo.' };
    }

    user.targetPage = resolveTargetPage_(user);

    if (requireAdmin && !isAdministratorRole_(user.role)) {
      return { valid: false, reason: 'Se requiere rol Administrador.' };
    }

    return {
      valid: true,
      user: user,
      authKey: JSON.stringify({ username: auth.username, password: auth.password })
    };
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

function normalizeAuth_(auth) {
  if (!auth) return { username: '', password: '' };

  if (typeof auth === 'string') {
    try {
      auth = JSON.parse(auth);
    } catch (e) {
      return { username: '', password: '' };
    }
  }

  return {
    username: String(auth.username || auth.user || '').trim().toLowerCase(),
    password: String(auth.password || auth.pass || '').trim()
  };
}

function resolveTargetPage_(user) {
  user = user || {};

  var role = normalizeRoleKey_(user.role);
  var dept = normalizeDepartmentKey_(user.department);

  if (role === 'ADMINISTRADOR') return 'administrativo';

  var dc = DEPARTMENT_CONFIG[dept];
  return dc ? dc.page : 'administrativo';
}

// ====================================
// COMPATIBILIDAD PARA MÓDULOS QUE LLAMAN validateSession(token)
// Ahora validateSession acepta JSON de credenciales, NO token de URL.
// ====================================

function validateSession(sessionPayload) {
  var session = validateCredentialAuth_(sessionPayload, false);
  if (!session.valid) return { valid: false, reason: session.reason || 'Sesión inválida' };
  return { valid: true, user: session.user, authKey: session.authKey };
}

function getSessionData(sessionPayload) {
  var session = validateSession(sessionPayload);
  if (!session.valid) return null;
  return { user: session.user };
}

function invalidateSession(sessionPayload) {
  return true;
}

// ====================================
// API PARA HTML POR google.script.run
// ====================================

function dsncApi(action, params, auth) {
  params = params || {};
  action = String(action || '').trim();

  try {
    if (action === 'TEST_CONNECTION') {
      return {
        success: true,
        message: 'API OK sin token por URL.',
        timestamp: new Date().toISOString(),
        appUrl: getAppUrl()
      };
    }

    if (action === 'AUTH_CHECK') {
      var check = validateCredentialAuth_(auth, false);
      return check.valid
        ? { success: true, message: 'Sesión válida.', user: check.user }
        : { success: false, message: check.reason || 'Sesión inválida.', redirect: true };
    }

    // Validación base: cualquier usuario activo puede autenticarse.
    // Las restricciones de administrador o departamento se aplican por acción.
    var session = validateCredentialAuth_(auth, false);
    if (!session.valid) {
      return { success: false, message: session.reason || 'Sesión inválida.', redirect: true };
    }

    var adminOnlyActions = [
      'GET_USERS',
      'GET_LOGS',
      'GET_ADMIN_ALL_INDICATORS',
      'ADMIN_GET_DASHBOARD_FULL',
      'CREATE_USER',
      'UPDATE_USER',
      'RESET_USER_PASSWORD',
      'SEND_USER_CREDENTIALS',
      'SEND_REMINDER_EMAIL',
      'GET_DEPARTMENT_EMAILS',
      'SAVE_DEPARTMENT_EMAILS'
    ];

    if (adminOnlyActions.indexOf(action) >= 0) {
      var adminSession = validateCredentialAuth_(auth, true);
      if (!adminSession.valid) {
        return {
          success: false,
          message: adminSession.reason || 'Se requiere rol Administrador.',
          redirect: false
        };
      }
      session = adminSession;
    }

    var result = { success: false, message: 'Acción no válida: ' + action };

    if (OGA_ACTIONS.indexOf(action) >= 0 && typeof handleOGAAction === 'function') {
      // OGA puede ser usado por Administrador o usuarios OGA si el módulo lo permite.
      result = handleOGAAction(action, params, session);
    } else {
      switch (action) {
        case 'GET_USERS':
          result = getAllUsers(session);
          break;

        case 'GET_LOGS':
          result = getSystemLogs(session);
          break;

        case 'GET_ADMIN_ALL_INDICATORS':
          result = getAdminAllIndicatorData(params, session);
          break;

        case 'ADMIN_GET_DASHBOARD_FULL':
          result = adminGetDashboardFull(params, session);
          break;

        case 'SAVE_INDICATOR_DATA':
          result = saveIndicatorData(params, session);
          break;

        case 'GET_INDICATOR_DATA':
          result = getIndicatorData(params, session);
          break;

        case 'DELETE_INDICATOR':
          result = deleteIndicatorRow(params, session);
          break;

        case 'CREATE_USER':
          result = createUser(params, session);
          break;

        case 'UPDATE_USER':
          result = updateUserAdmin(params, session);
          break;

        case 'RESET_USER_PASSWORD':
          result = resetUserPasswordAdmin(params, session);
          break;

        case 'SEND_USER_CREDENTIALS':
          result = sendUserCredentialsAdmin(params, session);
          break;

        case 'SEND_REMINDER_EMAIL':
          result = sendReminderEmail(params, session);
          break;

        case 'GET_DEPARTMENT_EMAILS':
          result = getDepartmentEmails(params, session);
          break;

        case 'SAVE_DEPARTMENT_EMAILS':
          result = saveDepartmentEmails(params, session);
          break;

        case 'CENAME_ESTADO':
          result = (typeof pncxCenameEstado === 'function')
            ? pncxCenameEstado(session.authKey, params.filters || params || {})
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'CENAME_DIAGNOSTICO':
          result = (typeof pncxCenameDiagnostico === 'function')
            ? pncxCenameDiagnostico(session.authKey)
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'CENAME_IMPORTAR':
          result = (typeof pncxCenameImportar === 'function')
            ? pncxCenameImportar(session.authKey, params.payload || params || {})
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'CENAME_OBTENER_REGISTRO':
          result = (typeof pncxCenameObtenerRegistro === 'function')
            ? pncxCenameObtenerRegistro(session.authKey, params.idRegistro)
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'CENAME_GUARDAR_REGISTRO':
          result = (typeof pncxCenameGuardarRegistro === 'function')
            ? pncxCenameGuardarRegistro(session.authKey, params.payload || params || {})
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'CENAME_ELIMINAR_REGISTRO':
          result = (typeof pncxCenameEliminarRegistro === 'function')
            ? pncxCenameEliminarRegistro(session.authKey, params.idRegistro)
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'CENAME_DEPURAR_DUPLICADOS':
          result = (typeof pncxCenameDepurarDuplicados === 'function')
            ? pncxCenameDepurarDuplicados(session.authKey, params.applyChanges)
            : { success: false, message: 'Módulo CENAME no cargado.' };
          break;

        case 'LOGOUT':
          result = { success: true, message: 'Sesión cerrada localmente.' };
          break;

        default:
          result = { success: false, message: 'Acción no reconocida: ' + action };
      }
    }

    return result || { success: false, message: 'Respuesta vacía del servidor.' };
  } catch (error) {
    Logger.log('[dsncApi][ERROR] ' + action + ': ' + error.message + '\n' + (error.stack || ''));
    return { success: false, message: 'Error interno: ' + error.message };
  }
}

// ====================================
// API TRADICIONAL / JSONP DE COMPATIBILIDAD
// ====================================

function handleAPIRequest(e) {
  try {
    var params = Object.assign({}, e.parameter || {});
    if (e.postData && e.postData.contents) {
      try { params = Object.assign(params, JSON.parse(e.postData.contents)); } catch (err) {}
    }

    var action = String(params.action || '').trim().toUpperCase();

    // Endpoint externo CENAME con API key propia. No utiliza credenciales de usuario.
    if (
      CENAME_EXTERNAL_ACTIONS.indexOf(action) >= 0 &&
      typeof pncxCenameExternalEndpoint === 'function'
    ) {
      params.action = action;
      return createJSONResponse(pncxCenameExternalEndpoint(params));
    }

    if (action === 'AUTHENTICATE') {
      return createJSONResponse(authenticateUserByCredentials_(params.username, params.password));
    }

    if (action === 'TEST_CONNECTION') {
      return createJSONResponse({ success: true, message: 'API OK', timestamp: new Date().toISOString() });
    }

    var auth = params.auth || params.credentials || '';
    return createJSONResponse(dsncApi(action, params, auth));
  } catch (error) {
    return createJSONResponse({ success: false, message: 'Error API: ' + error.message });
  }
}

function handleJSONPRequest(e) {
  var params = e.parameter || {};
  var callback = String(params.callback || 'callback').replace(/[^a-zA-Z0-9_.$]/g, '');
  var action = String(params.action || '').trim();
  var result;

  try {
    action = action.toUpperCase();

    if (
      CENAME_EXTERNAL_ACTIONS.indexOf(action) >= 0 &&
      typeof pncxCenameExternalEndpoint === 'function'
    ) {
      params.action = action;
      result = pncxCenameExternalEndpoint(params);
    } else if (action === 'AUTHENTICATE') {
      result = authenticateUserByCredentials_(params.username, params.password);
    } else if (action === 'TEST_CONNECTION') {
      result = { success: true, message: 'JSONP OK', timestamp: new Date().toISOString(), appUrl: getAppUrl() };
    } else {
      result = dsncApi(action, params, params.auth || params.credentials || '');
    }
  } catch (error) {
    result = { success: false, message: 'Error interno: ' + error.message };
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ====================================
// USUARIOS
// ====================================

function getAllUsers(session) {
  try {
    requireAdmin_(session);

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sheet = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
    if (!sheet) return { success: false, message: 'Hoja de usuarios no encontrada.' };

    var data = sheet.getDataRange().getValues();
    var users = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var username = String(row[0] || '').trim();
      if (!username) continue;

      users.push({
        username: username,
        name: getDisplayName(username, String(row[2] || '').trim()),
        department: String(row[2] || '').trim(),
        role: String(row[3] || '').trim(),
        status: String(row[4] || '').trim(),
        lastAccess: formatDate(row[5]),
        email: String(row[6] || '').trim()
      });
    }

    return { success: true, users: users, total: users.length };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function createUser(params, session) {
  try {
    requireAdmin_(session);

    var username = String(params.username || '').trim().toLowerCase();
    var password = String(params.password || '').trim();
    var department = String(params.department || 'DSNC').trim().toUpperCase();
    var role = String(params.role || 'Usuario').trim();
    var status = String(params.status || 'Activo').trim();
    var email = String(params.email || '').trim();

    if (!username || !password) throw new Error('Usuario y contraseña son obligatorios.');

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sheet = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
    if (!sheet) throw new Error('Hoja de usuarios no encontrada.');

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim().toLowerCase() === username) {
        throw new Error('El usuario ya existe.');
      }
    }

    sheet.appendRow([username, password, department, role, status, '', email, new Date()]);
    logActivity(session.user, 'CREATE_USER', username);

    if (params.sendCredentials === true || String(params.sendCredentials) === 'true') {
      sendCredentialsEmail_(email, username, password);
    }

    return { success: true, message: 'Usuario creado correctamente.' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function updateUserAdmin(params, session) {
  try {
    requireAdmin_(session);

    var originalUsername = String(params.originalUsername || params.username || '').trim().toLowerCase();
    var username = String(params.username || '').trim().toLowerCase();
    var password = String(params.password || '').trim();
    var department = String(params.department || 'DSNC').trim().toUpperCase();
    var role = String(params.role || 'Usuario').trim();
    var status = String(params.status || 'Activo').trim();
    var email = String(params.email || '').trim();

    if (!originalUsername || !username) throw new Error('Usuario requerido.');

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sheet = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
    if (!sheet) throw new Error('Hoja de usuarios no encontrada.');

    var rowIndex = findUserRow_(sheet, originalUsername);
    if (!rowIndex) throw new Error('Usuario no encontrado.');

    sheet.getRange(rowIndex, 1).setValue(username);
    if (password) sheet.getRange(rowIndex, 2).setValue(password);
    sheet.getRange(rowIndex, 3).setValue(department);
    sheet.getRange(rowIndex, 4).setValue(role);
    sheet.getRange(rowIndex, 5).setValue(status);
    sheet.getRange(rowIndex, 7).setValue(email);

    if (params.sendCredentials === true || String(params.sendCredentials) === 'true') {
      var finalPass = password || String(sheet.getRange(rowIndex, 2).getValue() || '');
      sendCredentialsEmail_(email, username, finalPass);
    }

    logActivity(session.user, 'UPDATE_USER', username);
    return { success: true, message: 'Usuario actualizado correctamente.' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function resetUserPasswordAdmin(params, session) {
  try {
    requireAdmin_(session);

    var username = String(params.username || '').trim().toLowerCase();
    if (!username) throw new Error('Usuario requerido.');

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sheet = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
    if (!sheet) throw new Error('Hoja de usuarios no encontrada.');

    var rowIndex = findUserRow_(sheet, username);
    if (!rowIndex) throw new Error('Usuario no encontrado.');

    var newPassword = generatePassword_();
    sheet.getRange(rowIndex, 2).setValue(newPassword);

    var email = String(sheet.getRange(rowIndex, 7).getValue() || '').trim();
    if (params.sendEmail === true || String(params.sendEmail) === 'true') {
      sendCredentialsEmail_(email, username, newPassword);
    }

    logActivity(session.user, 'RESET_PASSWORD', username);
    return { success: true, message: 'Contraseña reseteada.', password: newPassword };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function sendUserCredentialsAdmin(params, session) {
  try {
    requireAdmin_(session);

    var username = String(params.username || '').trim().toLowerCase();
    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sheet = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
    var rowIndex = findUserRow_(sheet, username);
    if (!rowIndex) throw new Error('Usuario no encontrado.');

    var password = String(sheet.getRange(rowIndex, 2).getValue() || '').trim();
    var email = String(sheet.getRange(rowIndex, 7).getValue() || '').trim();

    sendCredentialsEmail_(email, username, password);
    logActivity(session.user, 'SEND_CREDENTIALS', username);

    return { success: true, message: 'Credenciales enviadas correctamente.' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function findUserRow_(sheet, username) {
  username = String(username || '').trim().toLowerCase();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === username) return i + 2;
  }
  return 0;
}

// ====================================
// INDICADORES / MÓDULOS COGUANOR Y CRETEC
// ====================================

function getAdminAllIndicatorData(params, session) {
  try {
    requireAdmin_(session);
    params = params || {};
    var limit = Math.max(1, Math.min(Number(params.limit || 200), 500));
    var departments = [];
    var summaryRows = [];
    ['COGUANOR', 'CRETEC'].forEach(function(dept) {
      var data = readIndicatorSheet_(dept, limit, {});
      departments.push(data);
      data.rows.forEach(function(row, index) {
        // Los módulos tienen encabezados distintos: nunca mezclar arreglos incompatibles.
        summaryRows.push({
          unidad:dept,
          registro:data.rowIndexes[index] || '',
          fecha:dept === 'CRETEC' ? row[2] : row[0],
          tipo:dept === 'CRETEC' ? row[13] : row[2],
          concepto:row[4] || '',
          cantidad:Number(dept === 'CRETEC' ? row[7] : row[3]) || 0
        });
      });
    });
    var cen = { department:'CENAME', headers:[], rows:[], totalRows:0, stats:{} };
    if (typeof pncxCenameEstado === 'function') {
      var c = pncxCenameEstado(session.authKey, { limit:Math.min(limit,100), includeHistory:false });
      if (c && c.success) {
        cen.stats=c.stats || {};
        cen.totalRows=Number(cen.stats.totalRegistros || 0);
        cen.rows=c.rows || [];
      } else { cen.error=(c && c.message) || 'CENAME no disponible.'; }
    }
    departments.push(cen);
    var oga={department:'OGA',headers:[],rows:[],totalRows:null,stats:{}};
    if (typeof handleOGAAction === 'function') {
      try {
        var og = handleOGAAction('OGA_GET_DASHBOARD', {}, session);
        if (og && og.success) {
          var st=(og.clientesResumen && og.clientesResumen.stats) || {};
          var ks=st.kpisSegmentados || {};
          var a=ks.Acreditados || {};
          var r=ks.Reconocidos || {};
          oga.totalRows=Number(a.universo || 0)+Number(r.universo || 0);
          oga.stats={acreditadosVigentes:Number(a.total || 0), reconocidosVigentes:Number(r.total || 0)};
        } else { oga.error=(og && og.message) || 'OGA no disponible'; }
      } catch (ogaError) { oga.error=ogaError.message; }
    }
    departments.push(oga);
    return {
      success:true, departments:departments, combinedRows:summaryRows,
      actualizado:Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Guatemala', "yyyy-MM-dd HH:mm")
    };
  } catch (error) { return {success:false,message:error.message}; }
}

function getIndicatorData(params, session) {
  try {
    params = params || {};

    var dept = normalizeDepartmentKey_(params.department);
    if (!dept) throw new Error('Departamento requerido.');

    requireDepartmentAccess_(session, dept);

    var data = readIndicatorSheet_(dept, Number(params.limit || 500), params);
    if (data && data.error) {
      throw new Error(data.error);
    }

    return { success: true, data: data };
  } catch (error) {
    Logger.log('[getIndicatorData][ERROR] ' + error.message + '\n' + (error.stack || ''));
    return { success: false, message: error.message, redirect: false };
  }
}

function saveIndicatorData(params, session) {
  try {
    params = params || {};

    var dept = normalizeDepartmentKey_(params.department);
    if (!dept) throw new Error('Departamento requerido.');

    requireDepartmentAccess_(session, dept);

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('INDICADORES'));
    var sheetName = CONFIG.SHEETS[dept] || dept;
    var sh = ss.getSheetByName(sheetName);

    var headers = getHeadersForDepartment_(dept);

    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    } else if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }

    var sheetHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    if (dept === 'COGUANOR') {
      validateCoguanorSheetHeaders_(sheetHeaders);
    }

    var rows = [];
    if (dept === 'CRETEC') {
      rows = buildCretecRows_(params, session);
    } else if (dept === 'COGUANOR') {
      // Usa los encabezados existentes para conservar la estructura real de la base.
      rows = buildCoguanorRows_(params, session, sheetHeaders);
    } else {
      rows = buildGenericIndicatorRows_(params, session);
    }

    if (!rows.length) throw new Error('No hay datos válidos para guardar.');

    var rowIndex = resolveSheetRowIndex_(params);

    if (rowIndex && rowIndex >= 2) {
      if (rowIndex > sh.getLastRow()) throw new Error('La fila a actualizar no existe.');
      if (rows.length !== 1) {
        throw new Error('Durante una edición solamente se puede actualizar un registro.');
      }

      // Se escribe únicamente el ancho actual de la fila generada; no se insertan,
      // eliminan ni renombran columnas de la hoja existente.
      sh.getRange(rowIndex, 1, 1, rows[0].length)
        .setValues([normalizeRowLength_(rows[0], rows[0].length)]);

      logActivity(session.user, 'UPDATE_INDICATOR_' + dept, 'Fila ' + rowIndex);
      return { success: true, message: 'Registro actualizado correctamente.', rowIndex: rowIndex };
    }

    var width = dept === 'COGUANOR'
      ? sheetHeaders.length
      : Math.max(headers.length, rows[0].length);
    rows = rows.map(function(r) { return normalizeRowLength_(r, width); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);

    logActivity(session.user, 'SAVE_INDICATOR_' + dept, 'Registros: ' + rows.length);

    return { success: true, message: 'Datos guardados correctamente.', inserted: rows.length };
  } catch (error) {
    return { success: false, message: error.message, redirect: false };
  }
}

function deleteIndicatorRow(params, session) {
  try {
    params = params || {};

    var dept = normalizeDepartmentKey_(params.department);
    if (!dept) throw new Error('Departamento requerido.');

    requireDepartmentAccess_(session, dept);

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('INDICADORES'));
    var sheetName = CONFIG.SHEETS[dept] || dept;
    var sh = ss.getSheetByName(sheetName);
    if (!sh) throw new Error('Hoja no encontrada: ' + sheetName);

    var rowIndex = resolveSheetRowIndex_(params);
    if (!rowIndex || rowIndex < 2 || rowIndex > sh.getLastRow()) {
      throw new Error('Fila inválida para eliminar.');
    }

    sh.deleteRow(rowIndex);

    logActivity(session.user, 'DELETE_INDICATOR_' + dept, 'Fila ' + rowIndex);
    return { success: true, message: 'Registro eliminado correctamente.' };
  } catch (error) {
    return { success: false, message: error.message, redirect: false };
  }
}

function readIndicatorSheet_(department, limit, filters) {
  var result = {
    department: normalizeDepartmentKey_(department),
    headers: [],
    rows: [],
    totalRows: 0,
    rowIndexes: [],
    error: ''
  };

  try {
    department = normalizeDepartmentKey_(department);
    filters = filters || {};

    if (!department) throw new Error('Departamento requerido.');

    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('INDICADORES'));
    var sheetName = CONFIG.SHEETS[department] || department;
    var sh = ss.getSheetByName(sheetName);

    if (!sh) {
      result.message = 'No existe la hoja de indicadores: ' + sheetName;
      return result;
    }

    var lastRow = sh.getLastRow();
    var lastColumn = sh.getLastColumn();

    if (lastRow < 1 || lastColumn < 1) return result;

    var values = sh.getRange(1, 1, lastRow, lastColumn).getValues();
    if (!values.length) return result;

    result.headers = values[0].map(function(value) {
      return String(value == null ? '' : value);
    });

    var rows = [];
    var rowIndexes = [];
    var monthFilter = String(filters.month || filters.mes || '').trim();

    for (var i = 1; i < values.length; i++) {
      var rawRow = values[i];
      var hasData = rawRow.some(function(cell) {
        return cell !== '' && cell !== null && cell !== undefined;
      });

      if (!hasData) continue;

      var row = serializeIndicatorRowForClient_(rawRow);

      if (monthFilter && String(row[1] || '').trim() !== monthFilter) continue;

      if (department === 'COGUANOR') {
        var coguanorType = String(row[2] || '').trim();
        var validCoguanorTypes = [
          'Norma Adoptada',
          'Norma Elaborada',
          'Norma Distribuida',
          'Consulta Técnica'
        ];
        if (validCoguanorTypes.indexOf(coguanorType) < 0) continue;
      }

      rows.push(row);
      rowIndexes.push(i + 1);
    }

    result.totalRows = rows.length;

    // Se conservan los registros más recientes cuando existe un límite.
    if (limit && limit > 0 && rows.length > limit) {
      var startIndex = rows.length - limit;
      result.rows = rows.slice(startIndex);
      result.rowIndexes = rowIndexes.slice(startIndex);
    } else {
      result.rows = rows;
      result.rowIndexes = rowIndexes;
    }

    return result;
  } catch (e) {
    Logger.log('[readIndicatorSheet_][ERROR] ' + e.message + '\n' + (e.stack || ''));
    result.error = e.message;
    result.message = e.message;
    return result;
  }
}

/**
 * Convierte una fila de Spreadsheet en datos compatibles con google.script.run.
 * Apps Script no puede devolver objetos Date dentro de arreglos u objetos.
 */
function serializeIndicatorRowForClient_(row) {
  row = Array.isArray(row) ? row : [];

  return row.map(function(value, columnIndex) {
    return serializeIndicatorCellForClient_(value, columnIndex);
  });
}

function serializeIndicatorCellForClient_(value, columnIndex) {
  if (value === null || value === undefined) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';

    var timeZone = Session.getScriptTimeZone() || 'America/Guatemala';

    // En los indicadores la columna C (índice 2) contiene una fecha de formulario.
    // Se devuelve yyyy-MM-dd para que pueda asignarse directamente a input[type=date].
    if (columnIndex === 2) {
      return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
    }

    // Timestamp y cualquier otra fecha se devuelven como texto, nunca como Date.
    return Utilities.formatDate(value, timeZone, "yyyy-MM-dd'T'HH:mm:ss");
  }

  if (typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean') {
    return value;
  }

  return String(value);
}

function getHeadersForDepartment_(dept) {
  dept = String(dept || '').trim().toUpperCase();

  if (dept === 'CRETEC') {
    return [
      'Timestamp',
      'Mes',
      'Fecha',
      'Cantidad',
      'Tema / Área',
      'Modalidad / Método',
      'Sector',
      'Personas',
      'Lugar / Organización',
      'Duración',
      'Observaciones',
      'Justificación',
      'Usuario',
      'Tipo'
    ];
  }

  if (dept === 'COGUANOR') {
    return getCoguanorExpectedHeaders_();
  }

  return [
    'Timestamp',
    'Mes',
    'Fecha',
    'Cantidad',
    'Descripción',
    'Tipo',
    'Observaciones',
    'Usuario',
    'Departamento'
  ];
}

/** Fecha civil, sin conversión UTC, para no desplazar días en CRETEC. */
function normalizeDateOnlyPNCal_(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (m) {
    var y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
    var valid=new Date(Date.UTC(y,mo-1,d));
    if (valid.getUTCFullYear()===y && valid.getUTCMonth()===mo-1 && valid.getUTCDate()===d) return m[1]+'-'+m[2]+'-'+m[3];
  }
  m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return normalizeDateOnlyPNCal_(m[3]+'-'+m[2]+'-'+m[1]);
  throw new Error('Fecha inválida en CRETEC: use AAAA-MM-DD.');
}

function buildCretecRows_(params, session) {
  var rows = [];
  var now = new Date();
  var mes = String(params.mes || '').trim();
  var userName = session.user.username || session.user.name || '';

  var conferencias = [];
  var eventos = [];

  try {
    conferencias = params.conferencias ? JSON.parse(params.conferencias) : [];
  } catch (e) {
    conferencias = [];
  }

  try {
    eventos = params.eventos ? JSON.parse(params.eventos) : [];
  } catch (e) {
    eventos = [];
  }

  conferencias.forEach(function(item) {
    if (!item) return;
    rows.push([
      now,
      mes,
      normalizeDateOnlyPNCal_(item.fecha),
      Number(item.conferencias_rt || 1),
      item.tema || '',
      item.modalidad || '',
      item.sector || '',
      Number(item.asistentes || 0),
      item.lugar || '',
      item.duracion || '',
      item.observaciones || '',
      '',
      userName,
      'Conferencia'
    ]);
  });

  eventos.forEach(function(item) {
    if (!item) return;
    rows.push([
      now,
      mes,
      normalizeDateOnlyPNCal_(item.fecha),
      1,
      item.area || '',
      item.metodo || '',
      item.sector || '',
      Number(item.personas || 0),
      item.organizacion || '',
      '',
      item.observaciones || '',
      params.justificacion_cambios || '',
      userName,
      'Evento'
    ]);
  });

  return rows;
}

function getCoguanorExpectedHeaders_() {
  return [
    'Timestamp',
    'Mes',
    'Tipo Registro',
    'Cantidad',
    'Catálogo Norma',
    'Código AMSE',
    'Área Técnica',
    'Sector',
    'Tipo Receptor',
    'Nombre Sector / Usuario Consumidor',
    'Contacto',
    'Teléfono',
    'Observaciones',
    'Usuario'
  ];
}

function validateCoguanorSheetHeaders_(headers) {
  headers = Array.isArray(headers) ? headers : [];
  var expected = getCoguanorExpectedHeaders_();

  if (headers.length !== expected.length) {
    throw new Error(
      'La hoja COGUANOR debe tener exactamente ' + expected.length +
      ' columnas. Actualmente tiene ' + headers.length + '. No se modificó la base de datos.'
    );
  }

  for (var i = 0; i < expected.length; i++) {
    if (normalizeCoguanorHeader_(headers[i]) !== normalizeCoguanorHeader_(expected[i])) {
      throw new Error(
        'Encabezado COGUANOR inválido en la columna ' + (i + 1) +
        '. Se esperaba "' + expected[i] + '" y se encontró "' + headers[i] +
        '". No se modificó la base de datos.'
      );
    }
  }

  return true;
}

function buildCoguanorRows_(params, session, existingHeaders) {
  params = params || {};
  existingHeaders = Array.isArray(existingHeaders) && existingHeaders.length
    ? existingHeaders
    : getCoguanorExpectedHeaders_();

  validateCoguanorSheetHeaders_(existingHeaders);

  var userName = session.user.username || session.user.name || '';
  var section = normalizeAccessText_(params.section || params.tipo || '');
  var records = [];

  if (section.indexOf('ADOPT') >= 0 || section.indexOf('ELABOR') >= 0) {
    parseCoguanorArray_(params.registros_adoptadas || params.registros_elaboradas)
      .forEach(function(item) {
        item = item || {};

        var record = {
          kind: 'adoptada',
          sectionLabel: 'Norma Adoptada',
          mes: String(item.mes || params.mes || '').trim(),
          numero_norma: String(item.numero_norma || item.codigo_amse || '').trim(),
          ctn: String(item.ctn || item.catalogo_norma || '').trim(),
          nombre_norma: String(item.nombre_norma || item.norma || item.area_tecnica || '').trim(),
          cantidad: Math.max(1, Number(item.cantidad || 1)),
          usuario: userName
        };

        if (record.mes && record.numero_norma && record.ctn && record.nombre_norma) {
          records.push(record);
        }
      });
  } else if (section.indexOf('DISTRIB') >= 0) {
    parseCoguanorArray_(params.registros_distribuidas)
      .forEach(function(item) {
        item = item || {};

        var extras = item.campos_adicionales;
        if (typeof extras === 'string') extras = parseCoguanorArray_(extras);
        if (!Array.isArray(extras)) extras = [];

        var record = {
          kind: 'distribuida',
          sectionLabel: 'Norma Distribuida',
          mes: String(params.mes || item.mes || '').trim(),
          fecha: String(item.fecha || '').trim(),
          nombre_solicitante: String(item.nombre_solicitante || item.nombre_sector || '').trim(),
          organizacion: String(item.organizacion || item.codigo_amse || '').trim(),
          cantidad: Math.max(1, Number(item.cantidad || 1)),
          ctn: String(item.ctn || item.catalogo_norma || '').trim(),
          norma: String(item.norma || item.area_tecnica || '').trim(),
          forma_contacto: String(item.forma_contacto || '').trim(),
          detalle_contacto: String(item.detalle_contacto || item.telefono || item.contacto || '').trim(),
          campos_adicionales: extras,
          observaciones: String(item.observaciones || '').trim(),
          usuario: userName
        };

        if (
          record.mes &&
          record.fecha &&
          record.nombre_solicitante &&
          record.ctn &&
          record.norma &&
          record.forma_contacto
        ) {
          records.push(record);
        }
      });
  } else if (section.indexOf('CONSULT') >= 0) {
    parseCoguanorArray_(params.registros_consultas)
      .forEach(function(item) {
        item = item || {};

        var record = {
          kind: 'consulta',
          sectionLabel: 'Consulta Técnica',
          mes: String(params.mes || item.mes || '').trim(),
          cantidad: Math.max(1, Number(item.cantidad || 1)),
          catalogo_norma: String(item.catalogo_norma || item.ctn || '').trim(),
          codigo_amse: String(item.codigo_amse || '').trim(),
          area_tecnica: String(item.area_tecnica || item.norma || '').trim(),
          sector: String(item.sector || '').trim(),
          tipo_receptor: String(item.tipo_receptor || '').trim(),
          nombre_sector: String(item.nombre_sector || '').trim(),
          contacto: String(item.contacto || '').trim(),
          telefono: String(item.telefono || '').trim(),
          observaciones: String(item.observaciones || '').trim(),
          usuario: userName
        };

        if (
          record.mes &&
          record.catalogo_norma &&
          record.sector &&
          record.tipo_receptor &&
          record.nombre_sector
        ) {
          records.push(record);
        }
      });
  }

  return records.map(mapCoguanorRecordToFixedRow_);
}

function parseCoguanorArray_(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    var parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function normalizeCoguanorHeader_(value) {
  return normalizeAccessText_(value)
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapCoguanorRecordToFixedRow_(record) {
  var row = new Array(14).fill('');

  row[0] = new Date();
  row[1] = record.mes || '';
  row[2] = record.sectionLabel || '';
  row[3] = Number(record.cantidad || 0);
  row[13] = record.usuario || '';

  if (record.kind === 'adoptada') {
    row[4] = record.ctn || '';
    row[5] = record.numero_norma || '';
    row[6] = record.nombre_norma || '';
  }

  if (record.kind === 'distribuida') {
    row[4] = record.ctn || '';
    row[5] = record.organizacion || '';
    row[6] = record.norma || '';
    row[7] = record.fecha || '';
    row[8] = record.forma_contacto || '';
    row[9] = record.nombre_solicitante || '';

    if (normalizeAccessText_(record.forma_contacto) === 'TELEFONO') {
      row[11] = record.detalle_contacto || '';
    } else {
      row[10] = record.detalle_contacto || '';
    }

    row[12] = formatCoguanorObservations_(
      record.observaciones,
      record.campos_adicionales
    );
  }

  if (record.kind === 'consulta') {
    row[4] = record.catalogo_norma || '';
    row[5] = record.codigo_amse || '';
    row[6] = record.area_tecnica || '';
    row[7] = record.sector || '';
    row[8] = record.tipo_receptor || '';
    row[9] = record.nombre_sector || '';
    row[10] = record.contacto || '';
    row[11] = record.telefono || '';
    row[12] = record.observaciones || '';
  }

  return row;
}

function formatCoguanorObservations_(observaciones, extras) {
  var lines = [];
  observaciones = String(observaciones || '').trim();
  extras = Array.isArray(extras) ? extras : [];

  if (observaciones) lines.push(observaciones);

  var extraLines = [];
  extras.forEach(function(extra) {
    extra = extra || {};
    var nombre = String(extra.nombre || extra.campo || extra.key || '').trim();
    var valor = String(extra.valor || extra.value || '').trim();
    if (nombre || valor) extraLines.push('- ' + (nombre || 'Campo') + ': ' + valor);
  });

  if (extraLines.length) {
    if (lines.length) lines.push('');
    lines.push('[Campos adicionales]');
    Array.prototype.push.apply(lines, extraLines);
  }

  return lines.join('\n');
}

function buildGenericIndicatorRows_(params, session) {
  var now = new Date();
  var userName = session.user.username || session.user.name || '';

  return [[
    now,
    params.mes || '',
    params.fecha || '',
    Number(params.cantidad || params.total || 0),
    params.nombre || params.titulo || params.descripcion || '',
    params.tipo || params.section || '',
    params.observaciones || '',
    userName,
    params.department || ''
  ]];
}

function resolveSheetRowIndex_(params) {
  params = params || {};

  var absolute = Number(params.absoluteRowIndex || params.absoluteRow || 0);
  if (absolute && absolute >= 2) return absolute;

  if (params.rowIndex !== undefined && params.rowIndex !== '') {
    var relative = Number(params.rowIndex);
    if (!isNaN(relative)) return relative + 2;
  }

  return 0;
}

function normalizeRowLength_(row, width) {
  row = row || [];
  var out = row.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

// ====================================
// DASHBOARD ADMINISTRATIVO CONSOLIDADO
// ====================================

function adminGetDashboardFull(params, session) {
  try {
    requireAdmin_(session);

    params = params || {};
    var limit = Number(params.limit || 500);

    var coguanor = readIndicatorSheet_('COGUANOR', limit, {});
    var cretec = readIndicatorSheet_('CRETEC', limit, {});
    var cename = { department: 'CENAME', totalRows: 0, rows: [], stats: {} };

    if (typeof pncxCenameEstado === 'function') {
      var c = pncxCenameEstado(session.authKey, { limit: limit });
      if (c && c.success) {
        cename.stats = c.stats || {};
        cename.rows = c.rows || [];
        cename.totalRows = cename.stats.totalRegistros || cename.rows.length || 0;
      } else {
        cename.message = c && c.message ? c.message : 'No se pudo consultar CENAME.';
      }
    }

    var oga = { totalRows: 0, rows: [] };
    if (typeof handleOGAAction === 'function') {
      var og = handleOGAAction('OGA_GET_CLIENTES', { limite: limit }, session);
      if (og && og.success) {
        oga.rows = og.clientes || [];
        oga.totalRows = oga.rows.length;
      } else {
        oga.message = og && og.message ? og.message : 'No se pudo consultar OGA.';
      }
    }

    var registros = [];

    (oga.rows || []).forEach(function(item) {
      registros.push({
        area: 'OGA',
        id: item.oecId || '',
        nombre: item.razon || '',
        categoria: item.tipo || '',
        estado: item.estado || '',
        fecha: item.acredDesde || item.ultimaEval || '',
        detalle: item.norma || ''
      });
    });

    (cename.rows || []).forEach(function(item) {
      registros.push({
        area: 'CENAME',
        id: item.idRegistro || '',
        nombre: item.subcategoria || item.categoria || '',
        categoria: item.categoria || '',
        estado: 'Registrado',
        fecha: item.fechaOperacion || item.fechaCarga || '',
        detalle: 'Calibraciones: ' + Number(item.calibraciones || 0) + ' | Huella: ' + Number(item.huella || 0)
      });
    });

    (coguanor.rows || []).forEach(function(row, i) {
      registros.push({
        area: 'COGUANOR',
        id: coguanor.rowIndexes && coguanor.rowIndexes[i] ? coguanor.rowIndexes[i] : i + 2,
        nombre: row[4] || row[2] || 'Registro COGUANOR',
        categoria: row[2] || '',
        estado: row[5] || '',
        fecha: row[0] || '',
        detalle: row[6] || ''
      });
    });

    (cretec.rows || []).forEach(function(row, i) {
      registros.push({
        area: 'CRETEC',
        id: cretec.rowIndexes && cretec.rowIndexes[i] ? cretec.rowIndexes[i] : i + 2,
        nombre: row[4] || 'Registro CRETEC',
        categoria: row[13] || row[5] || '',
        estado: 'Registrado',
        fecha: row[2] || row[0] || '',
        detalle: 'Personas: ' + Number(row[7] || 0) + ' | Mes: ' + String(row[1] || '')
      });
    });

    return {
      success: true,
      resumen: {
        totalRegistros: registros.length,
        totalOGA: oga.totalRows || 0,
        totalCENAME: cename.totalRows || 0,
        totalCOGUANOR: coguanor.totalRows || 0,
        totalCRETEC: cretec.totalRows || 0,
        actualizado: new Date().toISOString()
      },
      oga: oga,
      cename: cename,
      coguanor: coguanor,
      cretec: cretec,
      registros: registros.slice(0, limit)
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// ====================================
// EMAILS Y LOGS
// ====================================

function getDepartmentEmails(params, session) {
  try {
    requireAdmin_(session);
    var department = String(params.department || '').trim();
    var sh = getOrCreateEmailsSheet_();
    var data = sh.getDataRange().getValues();
    var emails = [];

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === department) {
        emails = String(data[i][1] || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
        break;
      }
    }

    return { success: true, emails: emails };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function saveDepartmentEmails(params, session) {
  try {
    requireAdmin_(session);
    var department = String(params.department || '').trim();
    var emails = String(params.emails || '').trim();
    if (!department) throw new Error('Departamento requerido.');

    var sh = getOrCreateEmailsSheet_();
    var data = sh.getDataRange().getValues();
    var rowIndex = 0;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === department) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex) sh.getRange(rowIndex, 2, 1, 3).setValues([[emails, new Date(), session.user.username]]);
    else sh.appendRow([department, emails, new Date(), session.user.username]);

    logActivity(session.user, 'SAVE_EMAILS', department);
    return { success: true, message: 'Correos guardados correctamente.' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function sendReminderEmail(params, session) {
  try {
    requireAdmin_(session);
    var emails = String(params.emails || '').trim();
    var subject = String(params.subject || 'Recordatorio DSNC').trim();
    var message = String(params.message || '').trim();
    if (!emails || !message) throw new Error('Destinatarios y mensaje son obligatorios.');

    MailApp.sendEmail({
      to: emails,
      subject: subject,
      htmlBody: '<div style="font-family:Arial,sans-serif;white-space:pre-line">' + escapeHtml_(message) + '</div>'
    });

    logActivity(session.user, 'SEND_REMINDER', emails);
    return { success: true, message: 'Recordatorio enviado correctamente.' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function getSystemLogs(session) {
  try {
    requireAdmin_(session);
    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sh = getOrCreateLogSheet_(ss);
    var values = sh.getDataRange().getValues();
    var logs = [];

    for (var i = Math.max(1, values.length - 200); i < values.length; i++) {
      var r = values[i];
      logs.push({
        timestamp: formatDate(r[0]),
        user: String(r[1] || ''),
        department: String(r[2] || ''),
        action: String(r[3] || ''),
        details: String(r[4] || '')
      });
    }

    logs.reverse();
    return { success: true, logs: logs };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function logActivity(user, action, details) {
  try {
    user = user || {};
    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sh = getOrCreateLogSheet_(ss);
    sh.appendRow([new Date(), user.username || user.name || '', user.department || '', action || '', details || '']);
  } catch (e) {
    Logger.log('[logActivity] ' + e.message);
  }
}

function getOrCreateLogSheet_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.LOGS_ACCESO);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEETS.LOGS_ACCESO);
    sh.appendRow(['Timestamp', 'Usuario', 'Departamento', 'Acción', 'Detalle']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getOrCreateEmailsSheet_() {
  var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
  var sh = ss.getSheetByName(CONFIG.SHEETS.EMAILS_CONFIG);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEETS.EMAILS_CONFIG);
    sh.appendRow(['Departamento', 'Emails', 'Actualizado', 'Usuario']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ====================================
// UTILIDADES DE ACCESO
// ====================================

function requireAdmin_(session) {
  if (!session || !session.valid) throw new Error('Sesión inválida.');
  if (!session.user || !isAdministratorRole_(session.user.role)) {
    throw new Error('Acceso denegado. Se requiere rol Administrador.');
  }
  return true;
}

function isAdmin_(session) {
  return !!(
    session &&
    session.valid &&
    session.user &&
    isAdministratorRole_(session.user.role)
  );
}

function requireDepartmentAccess_(session, department) {
  if (!session || !session.valid) throw new Error('Sesión inválida.');

  department = normalizeDepartmentKey_(department);
  if (!department) throw new Error('Departamento requerido.');

  var user = session.user || {};
  var role = normalizeRoleKey_(user.role);
  var userDept = normalizeDepartmentKey_(user.department);

  if (role === 'ADMINISTRADOR') return true;

  if (userDept !== department) {
    throw new Error(
      'Acceso denegado. Este usuario pertenece a ' +
      (userDept || 'un departamento no definido') +
      ' y no puede usar ' + department + '.'
    );
  }

  if (['USUARIO', 'JEFE'].indexOf(role) < 0) {
    throw new Error(
      'Acceso denegado. El rol "' +
      String(user.role || '') +
      '" no está autorizado para el módulo ' + department + '.'
    );
  }

  return true;
}

function normalizeRoleKey_(role) {
  return normalizeAccessText_(role);
}

function normalizeDepartmentKey_(department) {
  return normalizeAccessText_(department);
}

function isAdministratorRole_(role) {
  return normalizeRoleKey_(role) === 'ADMINISTRADOR';
}

function normalizeAccessText_(value) {
  var text = String(value || '').trim().toUpperCase();

  // Normalización compatible con V8 para evitar fallos por acentos o variaciones de mayúsculas.
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {}

  return text;
}

// ====================================
// UTILIDADES GENERALES
// ====================================

function updateLastAccessByUsername_(username) {
  try {
    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('USUARIOS'));
    var sh = ss.getSheetByName(CONFIG.SHEETS.USUARIOS);
    var rowIndex = findUserRow_(sh, username);
    if (rowIndex) sh.getRange(rowIndex, 6).setValue(new Date());
  } catch (e) {}
}

function getDisplayName(username, dept) {
  username = String(username || '').replace(/[._]/g, ' ');
  return username.replace(/\w\S*/g, function(t) {
    return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase();
  });
}

function formatDate(date) {
  if (!date) return 'N/A';
  try {
    if (Object.prototype.toString.call(date) === '[object Date]') {
      return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  } catch (e) {
    return String(date);
  }
}

function generatePassword_() {
  return 'Dsnc' + Math.floor(100000 + Math.random() * 900000);
}

function sendCredentialsEmail_(email, username, password) {
  if (!email) return;
  MailApp.sendEmail({
    to: email,
    subject: 'Credenciales Sistema DSNC',
    htmlBody: '<p>Sus credenciales del Sistema DSNC son:</p>' +
      '<p><b>Usuario:</b> ' + escapeHtml_(username) + '<br>' +
      '<b>Contraseña:</b> ' + escapeHtml_(password) + '</p>'
  });
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createJSONResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(message, code) {
  code = code || 500;
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="UTF-8"></head>' +
    '<body style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#f8fafc;color:#0f172a">' +
    '<h1>Error ' + code + '</h1><p>' + escapeHtml_(message) + '</p>' +
    '<a href="' + getAppUrl() + '?page=login" target="_top">Volver al login</a>' +
    '</body></html>'
  ).setTitle('Error ' + code);
}

function redirectToLogin() {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="UTF-8"></head><body>' +
    '<script>try{window.location.href="' + getAppUrl() + '?page=login";}catch(e){}<\/script>' +
    '<p>Redirigiendo al login...</p>' +
    '</body></html>'
  );
}

function forzarPermisosMAIL() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Prueba de autorización DSNC', 'Permisos de correo activos.');
}

// ====================================
// PRUEBA MANUAL DE LECTURA CRETEC
// Ejecutar desde el editor de Apps Script después de autorizar permisos.
// ====================================
function probarLecturaCRETEC() {
  try {
    var data = readIndicatorSheet_('CRETEC', 100, {});

    if (data && data.error) {
      throw new Error(data.error);
    }

    var response = {
      success: true,
      message: 'Lectura CRETEC correcta.',
      totalRows: Number(data.totalRows || 0),
      returnedRows: Array.isArray(data.rows) ? data.rows.length : 0,
      headers: data.headers || [],
      firstRow: data.rows && data.rows.length ? data.rows[0] : []
    };

    Logger.log(JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    var failure = {
      success: false,
      message: error.message,
      stack: error.stack || ''
    };

    Logger.log(JSON.stringify(failure, null, 2));
    return failure;
  }
}

// ====================================
// PRUEBA COGUANOR SIN ESCRIBIR EN LA BASE
// Lee los encabezados reales y valida el mapeo de los nuevos formularios.
// No agrega, actualiza ni elimina filas.
// ====================================
function probarEstructuraCOGUANORSinGuardar() {
  try {
    var ss = SpreadsheetApp.openById(pncalSpreadsheetId_('INDICADORES'));
    var sh = ss.getSheetByName(CONFIG.SHEETS.COGUANOR);
    if (!sh) throw new Error('No existe la hoja COGUANOR.');

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    validateCoguanorSheetHeaders_(headers);

    var sessionPrueba = {
      user: {
        username: 'PRUEBA_SIN_GUARDAR',
        name: 'PRUEBA_SIN_GUARDAR'
      }
    };

    var adoptada = buildCoguanorRows_({
      section: 'adoptadas',
      mes: 'Julio',
      registros_adoptadas: JSON.stringify([{
        numero_norma: '17011',
        ctn: 'Gestión de la calidad',
        nombre_norma: 'Acreditación',
        cantidad: 1,
        mes: 'Julio'
      }])
    }, sessionPrueba, headers);

    var distribuida = buildCoguanorRows_({
      section: 'distribuidas',
      mes: 'Julio',
      registros_distribuidas: JSON.stringify([{
        fecha: '2026-07-25',
        nombre_solicitante: 'Solicitante de prueba',
        organizacion: 'Organización de prueba',
        cantidad: 1,
        ctn: 'Salud y seguridad ocupacional',
        norma: '50001',
        forma_contacto: 'Correo electrónico',
        detalle_contacto: 'prueba@example.com',
        campos_adicionales: [{ nombre: 'Tipo de entrega', valor: 'Digital' }],
        observaciones: 'Prueba sin escritura'
      }])
    }, sessionPrueba, headers);

    var consulta = buildCoguanorRows_({
      section: 'consultas',
      mes: 'Julio',
      registros_consultas: JSON.stringify([{
        cantidad: 1,
        catalogo_norma: 'Asuntos generales',
        codigo_amse: 'AMSE-001',
        area_tecnica: 'Área de prueba',
        sector: 'Público',
        tipo_receptor: 'Institución',
        nombre_sector: 'Institución de prueba',
        contacto: 'Persona de contacto',
        telefono: '5555-5555',
        observaciones: 'Prueba sin escritura'
      }])
    }, sessionPrueba, headers);

    var response = {
      success: true,
      message: 'Mapeo COGUANOR validado sin escribir en la base.',
      headers: headers,
      numeroColumnasBase: headers.length,
      muestraAdoptada: adoptada[0] || [],
      muestraDistribuida: distribuida[0] || [],
      muestraConsulta: consulta[0] || []
    };

    Logger.log(JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    var failure = {
      success: false,
      message: error.message,
      stack: error.stack || ''
    };

    Logger.log(JSON.stringify(failure, null, 2));
    return failure;
  }
}