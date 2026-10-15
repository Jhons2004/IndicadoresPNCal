/*********************************
 * CENAME - Modulo robusto v4.2
 * Compatible con hojas existentes (headers con tildes)
 * Fecha internacional obligatoria: YYYY-MM-DD
 * Lookup normalizado, deduplicacion, endpoint JSON con UPSERT idReporte y debug adaptativo
 *********************************/

var PNCX_CENAME_CFG = {
  spreadsheetId: '1EPThZen3zVh-ghVSR5URpn7Sh6qf9xXzxJvCUpjXUm0',
  timezone: Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'America/Guatemala',
  dateFormat: 'yyyy-MM-dd',
  datePattern: /^\d{4}-\d{2}-\d{2}$/,
  dateTimeFormat: "yyyy-MM-dd'T'HH:mm:ssXXX",
  sheets: {
    loads:      'CENAME_CARGAS',
    records:    'CENAME_REGISTROS',
    summary:    'CENAME_RESUMEN_MENSUAL',
    debug:      'CENAME_DEBUG',
    duplicates: 'CENAME_DUPLICADOS'
  }
};

/*
 * CLASIFICACION OFICIAL DE DATOS CENAME.
 * El valor "id" se almacena en la hoja para que el frontend y los endpoints
 * puedan separar permanentemente cada entorno sin mezclar registros.
 */
var PNCX_CENAME_ENV = {
  DISPENSADORES_GASOLINA: {
    id: 'DISPENSADORES_GASOLINA',
    label: 'Dispensadores de gasolina',
    aliases: ['dispensador', 'combustible', 'gasolina', 'diesel', 'estacion de servicio', 'hidrocarburo']
  },
  PRODUCTO_PREEMPACADO: {
    id: 'PRODUCTO_PREEMPACADO',
    label: 'Producto preempacado',
    aliases: ['preempacado', 'pre empacado', 'pre-envasado', 'preenvasado', 'producto empacado', 'contenido neto']
  },
  INSTRUMENTOS_CALIBRADOS: {
    id: 'INSTRUMENTOS_CALIBRADOS',
    label: 'Instrumentos calibrados',
    aliases: ['calibracion', 'calibrado', 'instrumento', 'metrologia', 'certificado de calibracion']
  }
};

var PNCX_CENAME_RECORD_HEADERS = [
  'ID Registro','ID Carga','Fecha Carga','Fecha Operacion','Año','Mes',
  'Categoria','Subcategoria','Sector','Departamento Operativo',
  'Calibraciones','Certificados','Informes','Estaciones','Dispensadores',
  'Productos','Unidades','Poblacion','Huella Economica','Observaciones',
  'Hoja Fuente','Fila Origen','Archivo','Usuario','Timestamp Sistema',
  'Entorno','Municipio','Productos Detalle','Verificaciones',
  'Inmovilizaciones','Clientes Mes','Clave Unica','Origen','ID Externo',
  'Actualizado Externo'
];

var PNCX_CENAME_SUMMARY_HEADERS = [
  'Periodo','Año','Mes','Categoria','Registros','Calibraciones','Verificaciones',
  'Certificados','Informes','Estaciones','Dispensadores','Productos','Unidades',
  'Poblacion','Huella Economica','Ultima Actualizacion','Entorno',
  'Inmovilizaciones','Clientes Mes'
];

var PNCX_CENAME_LOAD_HEADERS = [
  'ID Carga','Fecha Carga','Archivo','Tipo Detectado','Registros Insertados',
  'Huella Economica','Usuario','Departamento','Año Referencia','Hojas Leidas',
  'Estado','Detalle','Timestamp Inicio','Timestamp Fin','Duracion ms',
  'Registros Leidos','Registros Validos','Registros Duplicados',
  'Registros Omitidos','Registros con Error','Poblacion',
  'Verificaciones Detectadas','Origen','Entornos Detectados',
  'Registros Actualizados','Registros Ignorados'
];

var PNCX_CENAME_DUPLICATE_HEADERS = [
  'Timestamp','ID Carga','Clave','Motivo','Fecha Operacion','Categoria',
  'Subcategoria','Sector','Departamento Operativo','Calibraciones',
  'Certificados','Informes','Estaciones','Dispensadores','Productos','Unidades',
  'Poblacion','Huella Economica','Hoja Fuente','Fila Origen','Archivo','Usuario',
  'Entorno','Municipio','Productos Detalle','Verificaciones',
  'Inmovilizaciones','Clientes Mes','Origen','ID Externo','Actualizado Externo'
];

/**
 * Genera o reemplaza la llave privada del endpoint CENAME.
 * Ejecutar manualmente una sola vez desde Apps Script y guardar el valor.
 */
function pncxCenameGenerarApiKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('CENAME_API_KEY', key);
  Logger.log('CENAME: clave creada correctamente; consulte ScriptProperties de forma segura.');
  return {
    success: true,
    message: 'API key generada; guárdela de forma segura y no la publique.',
    apiKey: key
  };
}

function pncxCenameVerifyApiKey_(provided) {
  var expected = String(PropertiesService.getScriptProperties().getProperty('CENAME_API_KEY') || '').trim();
  var received = String(provided || '').trim();
  if (!expected) throw new Error('No existe CENAME_API_KEY. Ejecute pncxCenameGenerarApiKey().');
  if (!received || received !== expected) throw new Error('API key invalida.');
  return true;
}


// ─────────────────────────────────────────────────────────────
// NUCLEO: lectura tolerante a tildes
// Convierte headers a clave sin tildes ni espacios para indexar
// ─────────────────────────────────────────────────────────────

function pncxCenameNormalizeKey_(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

// Lee la hoja y retorna objetos cuyas claves son normalizadas
function pncxCenameSheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length <= 1) return [];
  var normHeaders = data[0].map(function(h) { return pncxCenameNormalizeKey_(h); });
  return data.slice(1).map(function(row) {
    var obj = {};
    normHeaders.forEach(function(k, i) { if (k) obj[k] = row[i]; });
    return obj;
  });
}

// Obtiene un valor usando la clave normalizada
// Acepta cualquier forma: 'Categoría', 'Categoria', 'categoria', 'CATEGORÍA'
function pncxCenameGet_(obj, field) {
  if (!obj) return '';
  var key = pncxCenameNormalizeKey_(field);
  var val = obj[key];
  if (val !== undefined && val !== null) return val;
  // Busqueda parcial como fallback
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(key) >= 0 || key.indexOf(keys[i]) >= 0) return obj[keys[i]];
  }
  return '';
}

// Lee una fila como objeto normalizado
function pncxCenameReadObjectRow_(sheet, rowNumber) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row     = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var obj = {};
  headers.forEach(function(h, i) {
    var key = pncxCenameNormalizeKey_(h);
    if (key) obj[key] = row[i];
  });
  return obj;
}

// ─────────────────────────────────────────────────────────────
// PUBLICAS
// ─────────────────────────────────────────────────────────────

function pncxCenameInicializar() {
  try {
    var ss = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);

    var migration = pncxCenameEnsureRecordClassification_(store.records);
    var duplicateDateMigration = pncxCenameNormalizeExistingDateColumn_(
      store.duplicates,
      'Fecha Operacion'
    );

    pncxCenameRebuildSummary_(ss);
    pncxCenameApplyDateFormats_(store);
    SpreadsheetApp.flush();

    return {
      success:true,
      message:'Modulo CENAME inicializado correctamente con fechas ISO YYYY-MM-DD.',
      dateFormat:'YYYY-MM-DD',
      spreadsheetId:ss.getId(),
      spreadsheetName:ss.getName(),
      migratedRecords:migration.updated,
      normalizedRecordDates:migration.normalizedDates || 0,
      normalizedDuplicateDates:duplicateDateMigration.updated,
      invalidLegacyDates:
        (migration.invalidDates || 0) + (duplicateDateMigration.invalid || 0),
      totalRecords:migration.total,
      sheets:ss.getSheets().map(function(s){ return s.getName(); })
    };
  } catch (error) {
    return pncxCenameError_('No fue posible inicializar el modulo.',error);
  }
}

function pncxCenameDiagnostico(sessionToken) {
  try {
    var session = pncxCenameValidateSession_(sessionToken);
    var ss    = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);
    return {
      success:         true,
      sessionValid:    !!(session && session.valid),
      spreadsheetId:   ss.getId(),
      spreadsheetName: ss.getName(),
      user:            session.user || null,
      rows: {
        loads:      Math.max(store.loads.getLastRow()      - 1, 0),
        records:    Math.max(store.records.getLastRow()    - 1, 0),
        summary:    Math.max(store.summary.getLastRow()    - 1, 0),
        debug:      Math.max(store.debug.getLastRow()      - 1, 0),
        duplicates: Math.max(store.duplicates.getLastRow() - 1, 0)
      },
      sheetNames: ss.getSheets().map(function(s) { return s.getName(); })
    };
  } catch (error) {
    return pncxCenameError_('No fue posible ejecutar el diagnostico.', error);
  }
}

// SIEMPRE retorna objeto valido — nunca null
function pncxCenameEstado(sessionToken, filters) {
  var emptyStats = {
    totalCargas:0,totalRegistros:0,totalCalibraciones:0,totalVerificaciones:0,
    totalHuella:0,totalPoblacion:0,totalDuplicados:0,totalOmitidos:0,totalErrores:0,
    totalInmovilizaciones:0,totalClientesMes:0
  };

  try {
    var session = pncxCenameValidateSession_(sessionToken);
    pncxCenameAssertAccess_(session.user || {});

    var ss = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);
    filters = filters || {};

    // El panel administrativo no necesita bitácoras ni todo el histórico de cargas.
    var includeHistory = filters.includeHistory !== false;
    var loads = includeHistory ? pncxCenameSheetToObjects_(store.loads) : [];
    var records = pncxCenameSheetToObjects_(store.records);
    var debugRows = includeHistory ? pncxCenameSheetToObjects_(store.debug) : [];
    var summaryRows = pncxCenameSheetToObjects_(store.summary);

    if (records.length && !summaryRows.length) {
      pncxCenameRebuildSummary_(ss);
      summaryRows = pncxCenameSheetToObjects_(store.summary);
    }

    var year = String(filters.year || '').trim();
    var month = String(filters.month || '').trim();
    var environment = pncxCenameCanonicalEnvironment_(filters.environment || filters.entorno || '');
    var text = pncxCenameNormalizeText_(filters.text || '');
    var limit = Math.max(1, Math.min(Number(filters.limit || 5000), 10000));

    function anioStr(r) {
      return String(pncxCenameGet_(r, 'Año') || '').split('.')[0].trim();
    }
    function mesStr(r) {
      return String(pncxCenameGet_(r, 'Mes') || '').split('.')[0].trim();
    }
    function envId(r) {
      return pncxCenameGetEnvironmentFromObject_(r);
    }

    var filteredRecords = records.filter(function(r) {
      if (year && anioStr(r) !== year) return false;
      if (month && mesStr(r) !== month) return false;
      if (environment && envId(r) !== environment) return false;

      if (text) {
        var joined = pncxCenameNormalizeText_([
          pncxCenameGet_(r,'ID Registro'),
          pncxCenameEnvironmentLabel_(envId(r)),
          pncxCenameGet_(r,'Categoria'),
          pncxCenameGet_(r,'Subcategoria'),
          pncxCenameGet_(r,'Sector'),
          pncxCenameGet_(r,'Departamento Operativo'),
          pncxCenameGet_(r,'Municipio'),
          pncxCenameGet_(r,'Productos Detalle'),
          pncxCenameGet_(r,'Archivo'),
          pncxCenameGet_(r,'Observaciones')
        ].join(' '));
        if (joined.indexOf(text) < 0) return false;
      }
      return true;
    });

    var filteredLoads = loads.filter(function(r) {
      if (year) {
        var loadYear = String(pncxCenameGet_(r,'Año Referencia') || '').split('.')[0].trim();
        if (loadYear && loadYear !== year) return false;
      }
      if (environment) {
        var detected = String(pncxCenameGet_(r,'Entornos Detectados') || '');
        if (detected) {
          if (detected.indexOf(environment) < 0) return false;
        } else {
          var legacyType = pncxCenameCanonicalEnvironment_(
            pncxCenameGet_(r,'Tipo Detectado') || ''
          );
          if (legacyType && legacyType !== environment) return false;
        }
      }
      return true;
    });

    var filteredSummary = summaryRows.filter(function(r) {
      if (year && String(pncxCenameGet_(r,'Año') || '').split('.')[0].trim() !== year) return false;
      if (month && String(pncxCenameGet_(r,'Mes') || '').split('.')[0].trim() !== month) return false;
      var rowEnv = pncxCenameCanonicalEnvironment_(pncxCenameGet_(r,'Entorno') || pncxCenameGet_(r,'Categoria'));
      if (environment && rowEnv !== environment) return false;
      return true;
    });

    filteredRecords.sort(function(a,b) {
      return pncxCenameDateMillis_(pncxCenameGet_(b,'Timestamp Sistema') || pncxCenameGet_(b,'Fecha Carga')) -
             pncxCenameDateMillis_(pncxCenameGet_(a,'Timestamp Sistema') || pncxCenameGet_(a,'Fecha Carga'));
    });
    filteredLoads.sort(function(a,b) {
      return pncxCenameDateMillis_(pncxCenameGet_(b,'Timestamp Fin') || pncxCenameGet_(b,'Fecha Carga')) -
             pncxCenameDateMillis_(pncxCenameGet_(a,'Timestamp Fin') || pncxCenameGet_(a,'Fecha Carga'));
    });
    filteredSummary.sort(function(a,b) {
      var ay = Number(pncxCenameGet_(a,'Año') || 0);
      var by = Number(pncxCenameGet_(b,'Año') || 0);
      var am = Number(pncxCenameGet_(a,'Mes') || 0);
      var bm = Number(pncxCenameGet_(b,'Mes') || 0);
      if (by !== ay) return by - ay;
      if (bm !== am) return bm - am;
      return String(pncxCenameGet_(a,'Categoria') || '').localeCompare(String(pncxCenameGet_(b,'Categoria') || ''));
    });
    var visibleLoadIds = {};
    filteredLoads.forEach(function(load) {
      visibleLoadIds[String(pncxCenameGet_(load,'ID Carga') || '')] = true;
    });
    if (environment) {
      debugRows = debugRows.filter(function(row) {
        var id = String(pncxCenameGet_(row,'ID Carga') || '');
        return !id || !!visibleLoadIds[id];
      });
    }

    debugRows.sort(function(a,b) {
      return pncxCenameDateMillis_(pncxCenameGet_(b,'Timestamp')) -
             pncxCenameDateMillis_(pncxCenameGet_(a,'Timestamp'));
    });

    var rowsUi = filteredRecords.slice(0, limit).map(function(r) {
      var env = envId(r);
      return {
        idRegistro: String(pncxCenameGet_(r,'ID Registro') || ''),
        idCarga: String(pncxCenameGet_(r,'ID Carga') || ''),
        fechaCarga: pncxCenameSerializableDate_(pncxCenameGet_(r,'Fecha Carga'), true),
        fechaOperacion: pncxCenameSerializableDate_(pncxCenameGet_(r,'Fecha Operacion'), false),
        anio: Number(pncxCenameGet_(r,'Año') || 0),
        mes: Number(pncxCenameGet_(r,'Mes') || 0),
        entorno: env,
        entornoLabel: pncxCenameEnvironmentLabel_(env),
        categoria: String(pncxCenameGet_(r,'Categoria') || pncxCenameEnvironmentLabel_(env)),
        subcategoria: String(pncxCenameGet_(r,'Subcategoria') || ''),
        sector: String(pncxCenameGet_(r,'Sector') || ''),
        departamentoOperativo: String(pncxCenameGet_(r,'Departamento Operativo') || ''),
        municipio: String(pncxCenameGet_(r,'Municipio') || ''),
        calibraciones: Number(pncxCenameGet_(r,'Calibraciones') || 0),
        certificados: Number(pncxCenameGet_(r,'Certificados') || 0),
        informes: Number(pncxCenameGet_(r,'Informes') || 0),
        estaciones: Number(pncxCenameGet_(r,'Estaciones') || 0),
        dispensadores: Number(pncxCenameGet_(r,'Dispensadores') || 0),
        productos: Number(pncxCenameGet_(r,'Productos') || 0),
        productosDetalle: pncxCenameProductsToArray_(pncxCenameGet_(r,'Productos Detalle')),
        unidades: Number(pncxCenameGet_(r,'Unidades') || 0),
        verificaciones: Number(pncxCenameGet_(r,'Verificaciones') || 0),
        inmovilizaciones: Number(pncxCenameGet_(r,'Inmovilizaciones') || 0),
        clientesMes: Number(pncxCenameGet_(r,'Clientes Mes') || pncxCenameGet_(r,'Poblacion') || 0),
        poblacion: Number(pncxCenameGet_(r,'Poblacion') || 0),
        huella: Number(pncxCenameGet_(r,'Huella Economica') || 0),
        observaciones: String(pncxCenameGet_(r,'Observaciones') || ''),
        archivo: String(pncxCenameGet_(r,'Archivo') || ''),
        usuario: String(pncxCenameGet_(r,'Usuario') || ''),
        origen: String(pncxCenameGet_(r,'Origen') || 'EXCEL'),
        idExterno: String(pncxCenameGet_(r,'ID Externo') || ''),
        idReporte: String(pncxCenameGet_(r,'ID Externo') || ''),
        actualizado: String(pncxCenameGet_(r,'Actualizado Externo') || ''),
        claveUnica: String(pncxCenameGet_(r,'Clave Unica') || pncxCenameBuildKeyFromObject_(r)),
        timestampSistema: pncxCenameSerializableDate_(pncxCenameGet_(r,'Timestamp Sistema'), true)
      };
    });

    var loadsUi = filteredLoads.slice(0, 300).map(function(r) {
      return {
        idCarga: String(pncxCenameGet_(r,'ID Carga') || ''),
        fechaCarga: pncxCenameSerializableDate_(pncxCenameGet_(r,'Fecha Carga'), true),
        timestampInicio: pncxCenameSerializableDate_(pncxCenameGet_(r,'Timestamp Inicio'), true),
        timestampFin: pncxCenameSerializableDate_(pncxCenameGet_(r,'Timestamp Fin'), true),
        archivo: String(pncxCenameGet_(r,'Archivo') || ''),
        tipo: String(pncxCenameGet_(r,'Tipo Detectado') || ''),
        leidos: Number(pncxCenameGet_(r,'Registros Leidos') || 0),
        validos: Number(pncxCenameGet_(r,'Registros Validos') || 0),
        insertados: Number(pncxCenameGet_(r,'Registros Insertados') || 0),
        duplicados: Number(pncxCenameGet_(r,'Registros Duplicados') || 0),
        actualizados: Number(pncxCenameGet_(r,'Registros Actualizados') || 0),
        ignorados: Number(pncxCenameGet_(r,'Registros Ignorados') || 0),
        omitidos: Number(pncxCenameGet_(r,'Registros Omitidos') || 0),
        errores: Number(pncxCenameGet_(r,'Registros con Error') || 0),
        poblacion: Number(pncxCenameGet_(r,'Poblacion') || 0),
        huella: Number(pncxCenameGet_(r,'Huella Economica') || 0),
        duracionMs: Number(pncxCenameGet_(r,'Duracion ms') || 0),
        estado: String(pncxCenameGet_(r,'Estado') || ''),
        usuario: String(pncxCenameGet_(r,'Usuario') || ''),
        origen: String(pncxCenameGet_(r,'Origen') || 'EXCEL'),
        entornos: String(pncxCenameGet_(r,'Entornos Detectados') || '')
      };
    });

    var summaryUi = filteredSummary.map(function(r) {
      var env = pncxCenameCanonicalEnvironment_(pncxCenameGet_(r,'Entorno') || pncxCenameGet_(r,'Categoria'));
      return {
        periodo: String(pncxCenameGet_(r,'Periodo') || ''),
        entorno: env,
        entornoLabel: pncxCenameEnvironmentLabel_(env),
        categoria: String(pncxCenameGet_(r,'Categoria') || pncxCenameEnvironmentLabel_(env)),
        registros: Number(pncxCenameGet_(r,'Registros') || 0),
        calibraciones: Number(pncxCenameGet_(r,'Calibraciones') || 0),
        verificaciones: Number(pncxCenameGet_(r,'Verificaciones') || 0),
        certificados: Number(pncxCenameGet_(r,'Certificados') || 0),
        informes: Number(pncxCenameGet_(r,'Informes') || 0),
        estaciones: Number(pncxCenameGet_(r,'Estaciones') || 0),
        dispensadores: Number(pncxCenameGet_(r,'Dispensadores') || 0),
        productos: Number(pncxCenameGet_(r,'Productos') || 0),
        unidades: Number(pncxCenameGet_(r,'Unidades') || 0),
        poblacion: Number(pncxCenameGet_(r,'Poblacion') || 0),
        huella: Number(pncxCenameGet_(r,'Huella Economica') || 0),
        inmovilizaciones: Number(pncxCenameGet_(r,'Inmovilizaciones') || 0),
        clientesMes: Number(pncxCenameGet_(r,'Clientes Mes') || 0)
      };
    });

    function sum(field) {
      return filteredRecords.reduce(function(total, r) {
        return total + Number(pncxCenameGet_(r, field) || 0);
      }, 0);
    }

    var stats = {
      totalCargas: filteredLoads.length,
      totalRegistros: filteredRecords.length,
      totalCalibraciones: sum('Calibraciones'),
      totalCertificados: sum('Certificados'),
      totalEstaciones: sum('Estaciones'),
      totalDispensadores: sum('Dispensadores'),
      totalVerificaciones: sum('Verificaciones') || filteredRecords.filter(function(r) {
        return envId(r) === 'DISPENSADORES_GASOLINA';
      }).length,
      totalHuella: sum('Huella Economica'),
      totalPoblacion: sum('Poblacion'),
      totalDuplicados: filteredLoads.reduce(function(a,r) {
        return a + Number(pncxCenameGet_(r,'Registros Duplicados') || 0);
      }, 0),
      totalOmitidos: filteredLoads.reduce(function(a,r) {
        return a + Number(pncxCenameGet_(r,'Registros Omitidos') || 0);
      }, 0),
      totalErrores: filteredLoads.reduce(function(a,r) {
        return a + Number(pncxCenameGet_(r,'Registros con Error') || 0);
      }, 0),
      totalInmovilizaciones: sum('Inmovilizaciones'),
      totalClientesMes: sum('Clientes Mes') || sum('Poblacion')
    };

    var environmentStats = {};
    Object.keys(PNCX_CENAME_ENV).forEach(function(key) {
      var cfg = PNCX_CENAME_ENV[key];
      var envRows = filteredRecords.filter(function(r) {
        return pncxCenameGetEnvironmentFromObject_(r) === cfg.id;
      });
      environmentStats[cfg.id] = {
        id: cfg.id,
        label: cfg.label,
        registros: envRows.length,
        huella: envRows.reduce(function(a,r) { return a + Number(pncxCenameGet_(r,'Huella Economica') || 0); }, 0)
      };
    });

    var debugUi = debugRows.slice(0, 200).map(function(r) {
      return {
        timestamp: pncxCenameSerializableDate_(pncxCenameGet_(r,'Timestamp'), true),
        nivel: String(pncxCenameGet_(r,'Nivel') || ''),
        etapa: String(pncxCenameGet_(r,'Etapa') || ''),
        idCarga: String(pncxCenameGet_(r,'ID Carga') || ''),
        hoja: String(pncxCenameGet_(r,'Hoja') || ''),
        fila: String(pncxCenameGet_(r,'Fila') || ''),
        mensaje: String(pncxCenameGet_(r,'Mensaje') || '')
      };
    });

    return {
      success: true,
      message: 'Tablero ' + (environment ? pncxCenameEnvironmentLabel_(environment) : 'CENAME') + ' actualizado correctamente.',
      selectedEnvironment: environment,
      environments: pncxCenameEnvironmentList_(),
      environmentStats: environmentStats,
      stats: stats,
      summary: summaryUi,
      loads: loadsUi,
      rows: rowsUi,
      debug: debugUi,
      lastLoad: loadsUi.length ? loadsUi[0] : null
    };
  } catch (error) {
    Logger.log('pncxCenameEstado ERROR: ' + error.message + '\n' + (error.stack || ''));
    return {
      success:false,
      message:'Error consultando tablero: ' + error.message,
      selectedEnvironment:'',
      environments:pncxCenameEnvironmentList_(),
      environmentStats:{},
      stats:emptyStats,
      summary:[],loads:[],rows:[],debug:[],lastLoad:null
    };
  }
}

function pncxCenameImportar(sessionToken, payload) {
  var lock = LockService.getScriptLock();
  var start = new Date();
  var idCarga = 'CEN-' + Utilities.formatDate(start, PNCX_CENAME_CFG.timezone, 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 100000);
  var debugEntries = [];
  var store = null;
  var user = null;
  var fileName = payload && payload.fileName ? payload.fileName : 'SIN_ARCHIVO';

  try {
    if (!lock.tryLock(30000)) throw new Error('Existe otra importacion en proceso. Intente nuevamente en unos segundos.');

    var session = pncxCenameValidateSession_(sessionToken);
    user = session.user || {};
    pncxCenameAssertAccess_(user);

    if (!payload || !payload.base64Data || !payload.fileName) {
      throw new Error('No se recibio el archivo Excel para importar.');
    }

    var ss = pncxCenameOpenSpreadsheet_();
    store = pncxCenameEnsureSheets_(ss);

    pncxCenameDebugPush_(
      debugEntries,idCarga,'INFO','INICIO','','','','',
      'Inicio de procesamiento: ' + fileName,
      {fileName:fileName,yearHint:payload.yearHint,mimeType:payload.mimeType},
      user
    );

    var temp = pncxCenameConvertExcelToSheet_(payload);
    var extraction;
    try {
      extraction = pncxCenameExtractWorkbook_(temp.spreadsheet,payload,idCarga,user);
    } finally {
      pncxCenameTrashFile_(temp.fileId);
    }

    debugEntries = debugEntries.concat(extraction.debugEntries || []);
    var rows = extraction.rows || [];
    var totalLeidos = Number(extraction.meta.totalRowsLeidas || 0);
    var totalValidos = Number(extraction.meta.totalRowsValidas || 0);
    var totalOmitidos = Number(extraction.meta.totalRowsOmitidas || 0);

    rows.forEach(function(r) {
      r.entorno = pncxCenameCanonicalEnvironment_(
        r.entorno || pncxCenameInferEnvironment_(
          [r.categoria,r.subcategoria,r.sector,r.hojaFuente,fileName].join(' '), r
        )
      );
      r.categoria = pncxCenameEnvironmentLabel_(r.entorno);
      r.origen = 'EXCEL';
      r.archivo = fileName;
    });

    var existingObjects = pncxCenameSheetToObjects_(store.records);
    var existingKeys = {};
    existingObjects.forEach(function(obj) {
      var storedKey = String(pncxCenameGet_(obj,'Clave Unica') || '').trim();
      var key = storedKey || pncxCenameBuildKeyFromObject_(obj);
      if (key) existingKeys[key] = true;
    });

    var batchKeys = {};
    var uniqueRows = [];
    var duplicateRows = [];
    var errorRows = [];

    rows.forEach(function(r) {
      try {
        var key = pncxCenameBuildKey_(r);
        if (!key) throw new Error('No se pudo construir la clave unica.');
        r.claveUnica = key;

        if (existingKeys[key]) {
          duplicateRows.push({row:r,clave:key,motivo:'Duplicado contra historico'});
          return;
        }
        if (batchKeys[key]) {
          duplicateRows.push({row:r,clave:key,motivo:'Duplicado dentro del mismo archivo'});
          return;
        }

        batchKeys[key] = true;
        existingKeys[key] = true;
        uniqueRows.push(r);
      } catch (err) {
        errorRows.push({row:r,motivo:err.message || String(err)});
      }
    });

    var end = new Date();
    var duration = end.getTime() - start.getTime();
    var userName = pncxCenameUserName_(user);
    var tipoDetectado = pncxCenameInferType_(uniqueRows.length ? uniqueRows : rows);
    var environmentsDetected = pncxCenameUniqueEnvironments_(rows);
    var totalHuella = uniqueRows.reduce(function(a,r){ return a + Number(r.huella || 0); },0);
    var totalCalibraciones = uniqueRows.reduce(function(a,r){ return a + Number(r.calibraciones || 0); },0);
    var totalVerificaciones = uniqueRows.reduce(function(a,r){ return a + Number(r.verificaciones || 0); },0);
    var totalPoblacion = uniqueRows.reduce(function(a,r){ return a + Number(r.poblacion || r.clientesMes || 0); },0);

    if (uniqueRows.length) {
      var rowsToAppend = uniqueRows.map(function(r,idx) {
        return pncxCenameRecordToArray_(
          'REG-' + idCarga + '-' + (idx + 1),
          idCarga,
          start,
          r,
          fileName,
          userName,
          end,
          store.records
        );
      });
      store.records.getRange(
        store.records.getLastRow() + 1,
        1,
        rowsToAppend.length,
        rowsToAppend[0].length
      ).setValues(rowsToAppend);
    }

    if (duplicateRows.length) {
      pncxCenameAppendDuplicates_(store.duplicates,duplicateRows,idCarga,fileName,userName);
    }

    store.loads.appendRow(pncxCenameNormalizeRowToHeaders_(store.loads, {
      'ID Carga':idCarga,
      'Fecha Carga':start,
      'Archivo':fileName,
      'Tipo Detectado':tipoDetectado,
      'Registros Insertados':uniqueRows.length,
      'Huella Economica':totalHuella,
      'Usuario':userName,
      'Departamento':'CENAME',
      'Año Referencia':Number(payload.yearHint || new Date().getFullYear()),
      'Hojas Leidas':(extraction.meta.hojasLeidas || []).join(', '),
      'Estado':uniqueRows.length ? 'OK' : 'SIN_DATOS',
      'Detalle':'Insertados: ' + uniqueRows.length +
        ' | Duplicados: ' + duplicateRows.length +
        ' | Omitidos: ' + totalOmitidos +
        ' | Errores: ' + errorRows.length,
      'Timestamp Inicio':start,
      'Timestamp Fin':end,
      'Duracion ms':duration,
      'Registros Leidos':totalLeidos,
      'Registros Validos':totalValidos,
      'Registros Duplicados':duplicateRows.length,
      'Registros Omitidos':totalOmitidos,
      'Registros con Error':errorRows.length,
      'Poblacion':totalPoblacion,
      'Verificaciones Detectadas':totalVerificaciones,
      'Origen':'EXCEL',
      'Entornos Detectados':environmentsDetected.join(',')
    }));

    pncxCenameDebugPush_(
      debugEntries,idCarga,'INFO','DEDUPE','','','','',
      'Deduplicacion completada.',
      {insertados:uniqueRows.length,duplicados:duplicateRows.length,errores:errorRows.length,omitidos:totalOmitidos},
      user
    );

    duplicateRows.slice(0,200).forEach(function(item) {
      pncxCenameDebugPush_(
        debugEntries,idCarga,'WARNING','DUPLICADO',
        item.row.hojaFuente || '',item.row.filaOrigen || '','',item.clave || '',
        item.motivo,item.row,user
      );
    });

    errorRows.slice(0,100).forEach(function(item) {
      pncxCenameDebugPush_(
        debugEntries,idCarga,'ERROR','ERROR_FILA',
        (item.row && item.row.hojaFuente) || '',
        (item.row && item.row.filaOrigen) || '',
        '','',item.motivo,item.row || {},user
      );
    });

    pncxCenameDebugPush_(
      debugEntries,idCarga,'INFO','FIN','','','','',
      'Procesamiento completado.',
      {
        durationMs:duration,totalLeidos:totalLeidos,totalValidos:totalValidos,
        totalInsertados:uniqueRows.length,totalDuplicados:duplicateRows.length,
        totalOmitidos:totalOmitidos,totalErrores:errorRows.length,
        entornos:environmentsDetected
      },
      user
    );

    pncxCenameAppendDebug_(store.debug,debugEntries);
    pncxCenameRebuildSummary_(ss);

    if (typeof logActivity === 'function') {
      logActivity(
        user,
        'IMPORT_CENAME_EXCEL_V4',
        fileName + ' -> insertados=' + uniqueRows.length + ', duplicados=' + duplicateRows.length
      );
    }

    return {
      success:true,
      message:'Archivo procesado. Nuevos: ' + uniqueRows.length +
        ' | Duplicados descartados: ' + duplicateRows.length +
        ' | Omitidos: ' + totalOmitidos +
        ' | Errores: ' + errorRows.length,
      carga:{
        idCarga:idCarga,
        archivo:fileName,
        fechaCarga:pncxCenameFormatDateTime_(start),
        timestampInicio:pncxCenameFormatDateTime_(start),
        timestampFin:pncxCenameFormatDateTime_(end),
        tipoDetectado:tipoDetectado,
        entornos:environmentsDetected
      },
      totals:{
        leidos:totalLeidos,
        validos:totalValidos,
        insertados:uniqueRows.length,
        duplicados:duplicateRows.length,
        omitidos:totalOmitidos,
        errores:errorRows.length,
        calibraciones:totalCalibraciones,
        verificaciones:totalVerificaciones,
        huella:totalHuella,
        poblacion:totalPoblacion
      }
    };
  } catch (error) {
    Logger.log('pncxCenameImportar ERROR: ' + error.message + '\n' + (error.stack || ''));
    try {
      if (!store) store = pncxCenameEnsureSheets_(pncxCenameOpenSpreadsheet_());
      pncxCenameDebugPush_(
        debugEntries,idCarga,'ERROR','EXCEPCION','','','','',
        error.message || String(error),
        {stack:error.stack || ''},
        user || {}
      );
      pncxCenameAppendDebug_(store.debug,debugEntries);
    } catch (nested) {
      Logger.log('Error registrando excepcion: ' + nested);
    }
    return pncxCenameError_('No fue posible importar el archivo.',error);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function pncxCenameObtenerRegistro(sessionToken, idRegistro) {
  try {
    var session=pncxCenameValidateSession_(sessionToken);
    pncxCenameAssertAccess_(session.user||{});
    if (!idRegistro) throw new Error('No se recibio el ID del registro.');
    var store=pncxCenameEnsureSheets_(pncxCenameOpenSpreadsheet_());
    var row=pncxCenameFindRowById_(store.records, idRegistro);
    if (!row) throw new Error('No se encontro el registro: '+idRegistro);
    return {success:true, record:pncxCenameObjectToUi_(pncxCenameReadObjectRow_(store.records,row))};
  } catch(error) { return pncxCenameError_('No fue posible obtener el registro.',error); }
}

function pncxCenameGuardarRegistro(sessionToken, payload) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) throw new Error('Existe otra operacion de escritura en proceso.');

    var session = pncxCenameValidateSession_(sessionToken);
    var user = session.user || {};
    pncxCenameAssertAccess_(user);

    var ss = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);
    var now = new Date();
    var normalized = pncxCenameNormalizeManualPayload_(payload);
    var isEdit = !!normalized.idRegistro;
    var userName = pncxCenameUserName_(user);
    var debugRows = [];

    normalized.entorno = pncxCenameCanonicalEnvironment_(
      normalized.entorno || normalized.categoria
    );
    if (!normalized.entorno) throw new Error('Seleccione uno de los tres entornos de CENAME.');
    normalized.categoria = pncxCenameEnvironmentLabel_(normalized.entorno);
    normalized.origen = normalized.origen || 'MANUAL';
    normalized.claveUnica = pncxCenameBuildKey_(normalized);

    var existing = pncxCenameSheetToObjects_(store.records);
    var duplicate = existing.some(function(obj) {
      if (
        isEdit &&
        String(pncxCenameGet_(obj,'ID Registro') || '') === String(normalized.idRegistro)
      ) {
        return false;
      }
      var existingKey = String(pncxCenameGet_(obj,'Clave Unica') || '').trim() ||
        pncxCenameBuildKeyFromObject_(obj);
      return existingKey === normalized.claveUnica;
    });

    if (duplicate) {
      throw new Error('Registro duplicado: ya existe exactamente la misma operación.');
    }

    if (isEdit) {
      var rowNumber = pncxCenameFindRowById_(store.records,normalized.idRegistro);
      if (!rowNumber) throw new Error('No se encontro el registro a editar.');

      var current = pncxCenameReadObjectRow_(store.records,rowNumber);

      // Si el registro provino del endpoint, una edición manual no debe perder
      // la identidad oficial del reporte ni la marca de versión externa.
      if (!normalized.idExterno) {
        normalized.idExterno = String(pncxCenameGet_(current,'ID Externo') || '').trim();
      }
      if (!normalized.actualizadoExterno) {
        normalized.actualizadoExterno = String(pncxCenameGet_(current,'Actualizado Externo') || '').trim();
      }
      if (normalized.idExterno) {
        normalized.claveUnica = pncxCenameBuildKey_(normalized);
      }

      var idCarga = pncxCenameGet_(current,'ID Carga') ||
        ('MANUAL-EDIT-' + Utilities.formatDate(now,PNCX_CENAME_CFG.timezone,'yyyyMMddHHmmss'));

      var rowArray = pncxCenameRecordToArray_(
        normalized.idRegistro,
        idCarga,
        pncxCenameGet_(current,'Fecha Carga') || now,
        normalized,
        normalized.archivo || pncxCenameGet_(current,'Archivo') || 'MANUAL',
        userName,
        now,
        store.records
      );

      store.records.getRange(rowNumber,1,1,rowArray.length).setValues([rowArray]);

      pncxCenameDebugPush_(
        debugRows,idCarga,'INFO','EDITAR','',rowNumber,
        normalized.idRegistro,normalized.claveUnica,
        'Registro editado manualmente.',normalized,user
      );
      pncxCenameAppendDebug_(store.debug,debugRows);
      pncxCenameRebuildSummary_(ss);

      return {
        success:true,
        message:'Registro actualizado correctamente.',
        record:pncxCenameObjectToUi_(pncxCenameReadObjectRow_(store.records,rowNumber))
      };
    }

    var idCargaN = 'MANUAL-' +
      Utilities.formatDate(now,PNCX_CENAME_CFG.timezone,'yyyyMMddHHmmss') +
      '-' + Math.floor(Math.random() * 100000);
    var idRegN = 'REG-' + idCargaN + '-1';

    store.records.appendRow(
      pncxCenameRecordToArray_(
        idRegN,idCargaN,now,normalized,
        normalized.archivo || 'MANUAL',
        userName,now,store.records
      )
    );

    store.loads.appendRow(pncxCenameNormalizeRowToHeaders_(store.loads,{
      'ID Carga':idCargaN,
      'Fecha Carga':now,
      'Archivo':normalized.archivo || 'MANUAL',
      'Tipo Detectado':pncxCenameEnvironmentLabel_(normalized.entorno),
      'Registros Insertados':1,
      'Huella Economica':Number(normalized.huella || 0),
      'Usuario':userName,
      'Departamento':'CENAME',
      'Año Referencia':Number(normalized.anio || new Date().getFullYear()),
      'Hojas Leidas':'MANUAL',
      'Estado':'OK',
      'Detalle':'Registro creado manualmente',
      'Timestamp Inicio':now,
      'Timestamp Fin':now,
      'Duracion ms':0,
      'Registros Leidos':1,
      'Registros Validos':1,
      'Registros Duplicados':0,
      'Registros Omitidos':0,
      'Registros con Error':0,
      'Poblacion':Number(normalized.poblacion || normalized.clientesMes || 0),
      'Verificaciones Detectadas':Number(normalized.verificaciones || 0),
      'Origen':'MANUAL',
      'Entornos Detectados':normalized.entorno
    }));

    pncxCenameDebugPush_(
      debugRows,idCargaN,'INFO','CREAR','','',idRegN,normalized.claveUnica,
      'Registro creado manualmente.',normalized,user
    );
    pncxCenameAppendDebug_(store.debug,debugRows);
    pncxCenameRebuildSummary_(ss);

    return {
      success:true,
      message:'Registro creado correctamente.',
      idRegistro:idRegN,
      entorno:normalized.entorno
    };
  } catch (error) {
    return pncxCenameError_('No fue posible guardar el registro.',error);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function pncxCenameEliminarRegistro(sessionToken, idRegistro) {
  try {
    var session=pncxCenameValidateSession_(sessionToken);
    var user=session.user||{};
    pncxCenameAssertAccess_(user);
    if (!idRegistro) throw new Error('No se recibio el ID del registro a eliminar.');
    var ss=pncxCenameOpenSpreadsheet_();
    var store=pncxCenameEnsureSheets_(ss);
    var row=pncxCenameFindRowById_(store.records,idRegistro);
    if (!row) throw new Error('No se encontro el registro solicitado.');
    var obj=pncxCenameReadObjectRow_(store.records,row);
    store.records.deleteRow(row);
    pncxCenameAppendDebug_(store.debug,[pncxCenameBuildDebugRow_(pncxCenameGet_(obj,'ID Carga')||'','INFO','ELIMINAR','',row,idRegistro,'','Registro eliminado manualmente.',obj,user)]);
    pncxCenameRebuildSummary_(ss);
    return {success:true,message:'Registro eliminado correctamente.',idRegistro:idRegistro};
  } catch(error){ return pncxCenameError_('No fue posible eliminar el registro.',error); }
}

// ─────────────────────────────────────────────────────────────
// HELPERS SPREADSHEET
// ─────────────────────────────────────────────────────────────

function crearHojasImportadorCENAME() {
  pncxCenameEnsureSheets_(pncxCenameOpenSpreadsheet_());
  SpreadsheetApp.flush();
  return 'Hojas listas.';
}

function autorizarDriveCename() {
  var blob=Utilities.newBlob('ok','text/plain','tmp.txt');
  var file=Drive.Files.create({name:'TMP_CENAME_AUTH'},blob,{fields:'id,name'});
  DriveApp.getFileById(file.id).setTrashed(true);
  return 'Autorizacion OK: '+file.id;
}

function pncxCenameOpenSpreadsheet_() {
  return SpreadsheetApp.openById(PNCX_CENAME_CFG.spreadsheetId);
}

// Solo crea header si la hoja no existe (respeta headers existentes con tildes)
function pncxCenameEnsureSheets_(ss) {
  var loads = pncxCenameGetOrCreateSheet_(
    ss,PNCX_CENAME_CFG.sheets.loads,PNCX_CENAME_LOAD_HEADERS
  );
  var records = pncxCenameGetOrCreateSheet_(
    ss,PNCX_CENAME_CFG.sheets.records,PNCX_CENAME_RECORD_HEADERS
  );
  var summary = pncxCenameGetOrCreateSheet_(
    ss,PNCX_CENAME_CFG.sheets.summary,PNCX_CENAME_SUMMARY_HEADERS
  );
  var debug = pncxCenameGetOrCreateSheet_(
    ss,PNCX_CENAME_CFG.sheets.debug,
    ['Timestamp','ID Carga','Nivel','Etapa','Hoja','Fila','ID Registro','Clave','Mensaje','Payload','Usuario']
  );
  var duplicates = pncxCenameGetOrCreateSheet_(
    ss,PNCX_CENAME_CFG.sheets.duplicates,PNCX_CENAME_DUPLICATE_HEADERS
  );

  var store = {
    loads:loads,
    records:records,
    summary:summary,
    debug:debug,
    duplicates:duplicates
  };

  pncxCenameApplyDateFormats_(store);
  return store;
}

function pncxCenameGetOrCreateSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }

  var existing = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var existingNorm = {};
  existing.forEach(function(h) {
    existingNorm[pncxCenameNormalizeKey_(h)] = true;
  });

  var missing = headers.filter(function(h) {
    return !existingNorm[pncxCenameNormalizeKey_(h)];
  });

  if (missing.length) {
    sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
  }

  sh.setFrozenRows(1);
  return sh;
}

function pncxCenameConvertExcelToSheet_(payload) {
  if (typeof Drive==='undefined'||!Drive.Files||!Drive.Files.create) throw new Error('Habilita el servicio avanzado de Drive API (v3).');
  var bytes=Utilities.base64Decode(payload.base64Data);
  var blob=Utilities.newBlob(bytes,payload.mimeType||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',payload.fileName||('CENAME_'+Date.now()+'.xlsx'));
  var tempFile=Drive.Files.create({name:'TMP_CENAME_'+Date.now(),mimeType:'application/vnd.google-apps.spreadsheet'},blob,{fields:'id,name,mimeType'});
  return {fileId:tempFile.id, spreadsheet:SpreadsheetApp.openById(tempFile.id)};
}

function pncxCenameTrashFile_(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); }
  catch(e){ Logger.log('No se pudo enviar a papelera el temporal: '+e); }
}

function pncxCenameExtractWorkbook_(ss, payload, idCarga, user) {
  var sheets=ss.getSheets();
  var allRows=[]; var debugEntries=[];
  var meta={hojasLeidas:[],hojasSaltadas:[],totalRowsLeidas:0,totalRowsValidas:0,totalRowsOmitidas:0,totalRowsVacias:0,totalRowsTotales:0,totalRowsPivot:0,totalRowsSinActividad:0,totalSheets:sheets.length};

  sheets.forEach(function(sheet) {
    var sheetName=sheet.getName();
    if (!pncxCenameAllowedSheet_(sheetName)) {
      meta.hojasSaltadas.push(sheetName);
      pncxCenameDebugPush_(debugEntries,idCarga,'INFO','HOJA_IGNORADA',sheetName,'','','','Hoja descartada por nombre.',{},user);
      return;
    }
    var rawValues=sheet.getDataRange().getValues();
    var displayValues=sheet.getDataRange().getDisplayValues();
    if (!displayValues||!displayValues.length) { meta.hojasSaltadas.push(sheetName); return; }

    var headerIndex=pncxCenameDetectHeaderRow_(displayValues);
    if (headerIndex<0) {
      meta.hojasSaltadas.push(sheetName);
      pncxCenameDebugPush_(debugEntries,idCarga,'WARNING','ENCABEZADO_NO_DETECTADO',sheetName,'','','','No se pudo detectar la fila de encabezado.',{},user);
      return;
    }
    var map=pncxCenameBuildColumnsMap_(displayValues[headerIndex]);
    if (!pncxCenameUsefulMap_(map)) {
      meta.hojasSaltadas.push(sheetName);
      pncxCenameDebugPush_(debugEntries,idCarga,'WARNING','MAPA',sheetName,'','','','Mapa de columnas insuficiente.',map,user);
      return;
    }
    meta.hojasLeidas.push(sheetName);
    for (var i=headerIndex+1; i<displayValues.length; i++) {
      meta.totalRowsLeidas++;
      var rd=displayValues[i]||[]; var rr=rawValues[i]||[];
      if (pncxCenameEmptyRow_(rd))     { meta.totalRowsOmitidas++; meta.totalRowsVacias++;   continue; }
      if (pncxCenameTotalRow_(rd))      { meta.totalRowsOmitidas++; meta.totalRowsTotales++;  continue; }
      if (pncxCenamePivotNoiseRow_(rd)) { meta.totalRowsOmitidas++; meta.totalRowsPivot++;    continue; }
      var normalized=pncxCenameNormalizeExcelRow_(rr,rd,map,sheetName,i+1,payload);
      if (normalized) { allRows.push(normalized); meta.totalRowsValidas++; }
      else             { meta.totalRowsOmitidas++; meta.totalRowsSinActividad++; }
    }
  });

  if (!allRows.length) pncxCenameDebugPush_(debugEntries,idCarga,'WARNING','FIN','','','','','No se encontraron filas validas en el Excel.',meta,user);
  return {rows:allRows, meta:meta, debugEntries:debugEntries};
}

function pncxCenameAllowedSheet_(name) {
  var n=pncxCenameNormalizeText_(name);
  return !!n && n.indexOf('resumen')<0 && n.indexOf('consolidado')<0 && n.indexOf('dashboard')<0 && n.indexOf('presupuesto')<0;
}

function pncxCenameDetectHeaderRow_(values) {
  var bestI=-1,bestS=0,limit=Math.min(values.length,20);
  for (var i=0;i<limit;i++) {
    var row=values[i].map(function(v){return pncxCenameNormalizeText_(v);});
    var s=0;
    row.forEach(function(cell){
      if (!cell) return;
      if (pncxCenameContainsAlias_(cell,['fecha']))                       s++;
      if (pncxCenameContainsAlias_(cell,['categoria','tipo','proceso']))  s++;
      if (pncxCenameContainsAlias_(cell,['sector']))                      s++;
      if (pncxCenameContainsAlias_(cell,['departamento']))                s++;
      if (pncxCenameContainsAlias_(cell,['calibraciones','calibracion'])) s++;
      if (pncxCenameContainsAlias_(cell,['certificados','certificado']))  s++;
      if (pncxCenameContainsAlias_(cell,['informes','informe']))          s++;
      if (pncxCenameContainsAlias_(cell,['estaciones']))                  s++;
      if (pncxCenameContainsAlias_(cell,['dispensadores']))               s++;
      if (pncxCenameContainsAlias_(cell,['productos','verificaciones']))  s++;
      if (pncxCenameContainsAlias_(cell,['unidades']))                    s++;
      if (pncxCenameContainsAlias_(cell,['poblacion','personas']))        s++;
      if (pncxCenameContainsAlias_(cell,['huella','impacto economico']))  s++;
    });
    if (s>bestS){bestS=s;bestI=i;}
  }
  return bestS>=3?bestI:-1;
}

function pncxCenameBuildColumnsMap_(headerRow) {
  var map = {};

  headerRow.forEach(function(cell,index) {
    var h = pncxCenameNormalizeText_(cell);
    if (!h) return;

    function set_(key) {
      if (map[key] === undefined) map[key] = index;
    }

    if (pncxCenameContainsAlias_(h,['fecha operacion','fecha operación','fecha','fecha servicio'])) set_('fechaOperacion');
    if (pncxCenameContainsAlias_(h,['año','anio'])) set_('anio');
    if (pncxCenameContainsAlias_(h,['mes'])) set_('mes');
    if (pncxCenameContainsAlias_(h,['entorno','unidad','tipo de unidad'])) set_('entorno');
    if (pncxCenameContainsAlias_(h,['categoria','categoría','tipo','proceso'])) set_('categoria');
    if (pncxCenameContainsAlias_(h,['subcategoria','subcategoría','actividad','magnitud','detalle','concepto','instrumento','producto'])) set_('subcategoria');
    if (pncxCenameContainsAlias_(h,['sector','sector atendido'])) set_('sector');
    if (pncxCenameContainsAlias_(h,['departamento operativo','depto operativo','sede operativa'])) set_('departamentoOperativo');
    if (pncxCenameContainsAlias_(h,['departamento'])) set_('departamentoGeografico');
    if (pncxCenameContainsAlias_(h,['municipio'])) set_('municipio');
    if (pncxCenameContainsAlias_(h,['calibraciones','calibracion','calibración','instrumentos calibrados'])) set_('calibraciones');
    if (pncxCenameContainsAlias_(h,['certificados','certificado'])) set_('certificados');
    if (pncxCenameContainsAlias_(h,['informes','informe'])) set_('informes');
    if (pncxCenameContainsAlias_(h,['estaciones','estaciones de servicio'])) set_('estaciones');
    if (pncxCenameContainsAlias_(h,['dispensadores'])) set_('dispensadores');
    if (pncxCenameContainsAlias_(h,['productos','productos verificados','productos preempacados'])) set_('productos');
    if (pncxCenameContainsAlias_(h,['productos detalle','combustibles','tipos de producto'])) set_('productosDetalle');
    if (pncxCenameContainsAlias_(h,['verificaciones','verificacion','verificación'])) set_('verificaciones');
    if (pncxCenameContainsAlias_(h,['inmovilizaciones','inmovilizados'])) set_('inmovilizaciones');
    if (pncxCenameContainsAlias_(h,['clientes mes','clientesmes','clientes','beneficiarios mes'])) set_('clientesMes');
    if (pncxCenameContainsAlias_(h,['unidades','vehiculos','vehículos','unidades lote'])) set_('unidades');
    if (pncxCenameContainsAlias_(h,['poblacion','población','personas','personas beneficiadas'])) set_('poblacion');
    if (pncxCenameContainsAlias_(h,['huella','impacto economico','impacto económico','huella economica','huella económica'])) set_('huella');
    if (pncxCenameContainsAlias_(h,['observaciones','obs'])) set_('observaciones');
    if (pncxCenameContainsAlias_(h,['id externo','codigo externo','identificador externo'])) set_('idExterno');
  });

  return map;
}

function pncxCenameUsefulMap_(map) {
  return map.fechaOperacion!==undefined||map.categoria!==undefined||map.calibraciones!==undefined||map.certificados!==undefined||map.estaciones!==undefined||map.productos!==undefined;
}

function pncxCenameNormalizeExcelRow_(rowRaw,rowDisplay,map,sheetName,rowNumber,payload) {
  payload = payload || {};

  var fechaRaw = pncxCenameValueByMap_(rowRaw,map,'fechaOperacion');
  var fechaOp = pncxCenameFormatDate_(fechaRaw);
  var parsedOperationDate = fechaOp ? pncxCenameParseDate_(fechaOp) : null;

  var categoria = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'categoria'));
  var subcategoria = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'subcategoria'));
  var sector = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'sector'));
  var deptoGeog = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'departamentoGeografico'));
  var deptoOp = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'departamentoOperativo'));
  var municipio = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'municipio'));
  var productosDetalle = pncxCenameProductsToArray_(
    pncxCenameValueByMap_(rowDisplay,map,'productosDetalle')
  );
  var entornoDirecto = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'entorno'));
  var idExterno = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'idExterno'));
  var observaciones = pncxCenameText_(pncxCenameValueByMap_(rowDisplay,map,'observaciones'));

  var normalized = {
    fechaOperacion:fechaOp || '',
    anio:parsedOperationDate ? parsedOperationDate.getFullYear() : '',
    mes:parsedOperationDate ? parsedOperationDate.getMonth() + 1 : '',
    categoria:categoria || '',
    subcategoria:subcategoria || '',
    sector:sector || '',
    departamentoOperativo:deptoOp || deptoGeog || 'CENAME',
    municipio:municipio || '',
    calibraciones:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'calibraciones')),
    certificados:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'certificados')),
    informes:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'informes')),
    estaciones:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'estaciones')),
    dispensadores:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'dispensadores')),
    productos:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'productos')),
    productosDetalle:productosDetalle,
    unidades:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'unidades')),
    verificaciones:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'verificaciones')),
    inmovilizaciones:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'inmovilizaciones')),
    clientesMes:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'clientesMes')),
    poblacion:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'poblacion')),
    huella:pncxCenameNumber_(pncxCenameValueByMap_(rowRaw,map,'huella')),
    observaciones:observaciones || '',
    hojaFuente:sheetName,
    filaOrigen:rowNumber,
    origen:'EXCEL',
    idExterno:idExterno || ''
  };

  if (!normalized.verificaciones && normalized.estaciones) {
    normalized.verificaciones = normalized.estaciones;
  }

  if (!normalized.clientesMes && normalized.poblacion) {
    normalized.clientesMes = normalized.poblacion;
  }

  if (!pncxCenameHasActivity_(normalized)) return null;

  /*
   * Toda fila con actividad debe tener una fecha valida. Excel puede
   * entregarla como objeto Date, serial numerico o texto; siempre se
   * normaliza a YYYY-MM-DD antes de guardar.
   */
  if (!normalized.fechaOperacion) return null;

  normalized.entorno = pncxCenameCanonicalEnvironment_(entornoDirecto) ||
    pncxCenameInferEnvironment_(
      [sheetName,categoria,subcategoria,sector,entornoDirecto].join(' '),
      normalized
    );
  normalized.categoria = pncxCenameEnvironmentLabel_(normalized.entorno);

  if (!normalized.subcategoria) normalized.subcategoria = sheetName;
  if (!normalized.sector && deptoGeog) normalized.sector = deptoGeog;

  return normalized;
}

function pncxCenameRebuildSummary_(ss) {
  var store = pncxCenameEnsureSheets_(ss);
  var summarySheet = store.summary;
  var records = pncxCenameSheetToObjects_(store.records);

  summarySheet.clearContents();
  summarySheet.getRange(1,1,1,PNCX_CENAME_SUMMARY_HEADERS.length)
    .setValues([PNCX_CENAME_SUMMARY_HEADERS]);
  summarySheet.setFrozenRows(1);

  if (!records.length) return;

  var groups = {};

  records.forEach(function(r) {
    var anio = Number(pncxCenameGet_(r,'Año') || 0);
    var mes = Number(pncxCenameGet_(r,'Mes') || 0);
    var env = pncxCenameGetEnvironmentFromObject_(r);
    var cat = pncxCenameEnvironmentLabel_(env);
    var key = [anio,mes,env].join('|');

    if (!groups[key]) {
      groups[key] = {
        anio:anio,mes:mes,entorno:env,categoria:cat,registros:0,
        calibraciones:0,verificaciones:0,certificados:0,informes:0,
        estaciones:0,dispensadores:0,productos:0,unidades:0,
        poblacion:0,huella:0,inmovilizaciones:0,clientesMes:0
      };
    }

    var g = groups[key];
    g.registros++;
    g.calibraciones += Number(pncxCenameGet_(r,'Calibraciones') || 0);
    g.verificaciones += Number(pncxCenameGet_(r,'Verificaciones') || 0);
    g.certificados += Number(pncxCenameGet_(r,'Certificados') || 0);
    g.informes += Number(pncxCenameGet_(r,'Informes') || 0);
    g.estaciones += Number(pncxCenameGet_(r,'Estaciones') || 0);
    g.dispensadores += Number(pncxCenameGet_(r,'Dispensadores') || 0);
    g.productos += Number(pncxCenameGet_(r,'Productos') || 0);
    g.unidades += Number(pncxCenameGet_(r,'Unidades') || 0);
    g.poblacion += Number(pncxCenameGet_(r,'Poblacion') || 0);
    g.huella += Number(pncxCenameGet_(r,'Huella Economica') || 0);
    g.inmovilizaciones += Number(pncxCenameGet_(r,'Inmovilizaciones') || 0);
    g.clientesMes += Number(pncxCenameGet_(r,'Clientes Mes') || 0);
  });

  var now = new Date();
  var data = Object.keys(groups).map(function(key) {
    var g = groups[key];
    return [
      g.anio + '-' + ('0' + g.mes).slice(-2),
      g.anio,g.mes,g.categoria,g.registros,g.calibraciones,
      g.verificaciones,g.certificados,g.informes,g.estaciones,
      g.dispensadores,g.productos,g.unidades,g.poblacion,g.huella,
      now,g.entorno,g.inmovilizaciones,g.clientesMes
    ];
  });

  data.sort(function(a,b) {
    if (Number(a[1]) !== Number(b[1])) return Number(a[1]) - Number(b[1]);
    if (Number(a[2]) !== Number(b[2])) return Number(a[2]) - Number(b[2]);
    return String(a[16]).localeCompare(String(b[16]));
  });

  if (data.length) {
    summarySheet.getRange(2,1,data.length,data[0].length).setValues(data);
  }
}

function pncxCenameRecordToArray_(idRegistro,idCarga,fechaCarga,r,fileName,userName,timestampSistema,recordSheet) {
  r = r || {};

  var fechaOperacionIso = pncxCenameRequireIsoDate_(
    r.fechaOperacion,
    'Fecha Operacion'
  );

  var parsedOperationDate = pncxCenameParseIsoDateStrict_(
    fechaOperacionIso,
    'Fecha Operacion'
  );

  var entorno = pncxCenameCanonicalEnvironment_(r.entorno || r.categoria) ||
    pncxCenameInferEnvironment_(
      [r.categoria,r.subcategoria,r.sector,r.hojaFuente,fileName].join(' '),r
    );

  var record = {
    'ID Registro':idRegistro,
    'ID Carga':idCarga,
    'Fecha Carga':fechaCarga,
    'Fecha Operacion':fechaOperacionIso,
    'Año':parsedOperationDate.getFullYear(),
    'Mes':parsedOperationDate.getMonth() + 1,
    'Categoria':pncxCenameEnvironmentLabel_(entorno),
    'Subcategoria':r.subcategoria || '',
    'Sector':r.sector || '',
    'Departamento Operativo':r.departamentoOperativo || 'CENAME',
    'Calibraciones':Number(r.calibraciones || 0),
    'Certificados':Number(r.certificados || 0),
    'Informes':Number(r.informes || 0),
    'Estaciones':Number(r.estaciones || 0),
    'Dispensadores':Number(r.dispensadores || 0),
    'Productos':Number(r.productos || 0),
    'Unidades':Number(r.unidades || 0),
    'Poblacion':Number(r.poblacion || r.clientesMes || 0),
    'Huella Economica':Number(r.huella || 0),
    'Observaciones':r.observaciones || '',
    'Hoja Fuente':r.hojaFuente || 'MANUAL',
    'Fila Origen':Number(r.filaOrigen || 0),
    'Archivo':fileName || r.archivo || '',
    'Usuario':userName || '',
    'Timestamp Sistema':timestampSistema || new Date(),
    'Entorno':entorno,
    'Municipio':r.municipio || '',
    'Productos Detalle':JSON.stringify(pncxCenameProductsToArray_(r.productosDetalle)),
    'Verificaciones':Number(r.verificaciones || 0),
    'Inmovilizaciones':Number(r.inmovilizaciones || 0),
    'Clientes Mes':Number(r.clientesMes || r.poblacion || 0),
    'Clave Unica':r.claveUnica || pncxCenameBuildKey_(r),
    'Origen':r.origen || 'EXCEL',
    'ID Externo':r.idExterno || '',
    'Actualizado Externo':r.actualizadoExterno || r.actualizado || ''
  };

  var targetHeaders = PNCX_CENAME_RECORD_HEADERS;
  if (recordSheet && recordSheet.getLastColumn && recordSheet.getLastColumn() > 0) {
    targetHeaders = recordSheet
      .getRange(1,1,1,recordSheet.getLastColumn())
      .getValues()[0];
  }

  var normalizedRecord = {};
  Object.keys(record).forEach(function(key) {
    normalizedRecord[pncxCenameNormalizeKey_(key)] = record[key];
  });

  return targetHeaders.map(function(header) {
    var key = pncxCenameNormalizeKey_(header);
    return normalizedRecord[key] !== undefined ? normalizedRecord[key] : '';
  });
}

function pncxCenameAppendDuplicates_(sheet,rows,idCarga,fileName,userName) {
  if (!rows || !rows.length) return;

  var now = new Date();
  var actualHeaders = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];

  var data = rows.map(function(item) {
    var r = item.row || {};
    var env = pncxCenameCanonicalEnvironment_(r.entorno || r.categoria) ||
      pncxCenameInferEnvironment_(
        [r.categoria,r.subcategoria,r.sector,r.hojaFuente,fileName].join(' '),r
      );

    var fechaOperacionIso = pncxCenameFormatDate_(r.fechaOperacion);
    if (!fechaOperacionIso) {
      fechaOperacionIso = String(r.fechaOperacion || '');
    }

    var obj = {
      'Timestamp':now,
      'ID Carga':idCarga,
      'Clave':item.clave || pncxCenameBuildKey_(r),
      'Motivo':item.motivo || '',
      'Fecha Operacion':fechaOperacionIso,
      'Categoria':pncxCenameEnvironmentLabel_(env),
      'Subcategoria':r.subcategoria || '',
      'Sector':r.sector || '',
      'Departamento Operativo':r.departamentoOperativo || '',
      'Calibraciones':Number(r.calibraciones || 0),
      'Certificados':Number(r.certificados || 0),
      'Informes':Number(r.informes || 0),
      'Estaciones':Number(r.estaciones || 0),
      'Dispensadores':Number(r.dispensadores || 0),
      'Productos':Number(r.productos || 0),
      'Unidades':Number(r.unidades || 0),
      'Poblacion':Number(r.poblacion || r.clientesMes || 0),
      'Huella Economica':Number(r.huella || 0),
      'Hoja Fuente':r.hojaFuente || '',
      'Fila Origen':Number(r.filaOrigen || 0),
      'Archivo':fileName || r.archivo || '',
      'Usuario':userName || '',
      'Entorno':env,
      'Municipio':r.municipio || '',
      'Productos Detalle':JSON.stringify(pncxCenameProductsToArray_(r.productosDetalle)),
      'Verificaciones':Number(r.verificaciones || 0),
      'Inmovilizaciones':Number(r.inmovilizaciones || 0),
      'Clientes Mes':Number(r.clientesMes || r.poblacion || 0),
      'Origen':r.origen || 'EXCEL',
      'ID Externo':r.idExterno || '',
      'Actualizado Externo':r.actualizadoExterno || r.actualizado || ''
    };

    var normalizedObj = {};
    Object.keys(obj).forEach(function(key) {
      normalizedObj[pncxCenameNormalizeKey_(key)] = obj[key];
    });

    return actualHeaders.map(function(header) {
      var key = pncxCenameNormalizeKey_(header);
      return normalizedObj[key] !== undefined ? normalizedObj[key] : '';
    });
  });

  sheet.getRange(sheet.getLastRow()+1,1,data.length,data[0].length).setValues(data);
  pncxCenameApplyColumnNumberFormat_(sheet,'Fecha Operacion','@');
  pncxCenameApplyColumnNumberFormat_(sheet,'Timestamp','yyyy-mm-dd hh:mm:ss');
}

// Adaptativo: detecta cuantas columnas tiene la hoja real y ajusta
function pncxCenameAppendDebug_(sheet,debugRows){
  if (!debugRows||!debugRows.length) return;
  var sheetCols=Math.max(sheet.getLastColumn()||0,11);
  var normalized=debugRows.map(function(row){
    var r=row.slice(0,sheetCols);
    while(r.length<sheetCols) r.push('');
    return r;
  });
  sheet.getRange(sheet.getLastRow()+1,1,normalized.length,sheetCols).setValues(normalized);
}

function pncxCenameDebugPush_(list,idCarga,nivel,etapa,hoja,fila,idRegistro,clave,mensaje,payload,user){
  list.push(pncxCenameBuildDebugRow_(idCarga,nivel,etapa,hoja,fila,idRegistro,clave,mensaje,payload,user));
}

function pncxCenameBuildDebugRow_(idCarga,nivel,etapa,hoja,fila,idRegistro,clave,mensaje,payload,user){
  return[new Date(),idCarga||'',nivel||'INFO',etapa||'',hoja||'',fila||'',idRegistro||'',clave||'',mensaje||'',JSON.stringify(payload||{}),pncxCenameUserName_(user||{})];
}

function pncxCenameFindRowById_(sheet,idRegistro){
  var lastRow=sheet.getLastRow();
  if(lastRow<2) return 0;
  var values=sheet.getRange(2,1,lastRow-1,1).getValues();
  for(var i=0;i<values.length;i++){if(String(values[i][0]||'')===String(idRegistro||'')) return i+2;}
  return 0;
}

function pncxCenameObjectToUi_(obj) {
  var env = pncxCenameGetEnvironmentFromObject_(obj);
  return {
    idRegistro:String(pncxCenameGet_(obj,'ID Registro') || ''),
    idCarga:String(pncxCenameGet_(obj,'ID Carga') || ''),
    fechaCarga:pncxCenameSerializableDate_(pncxCenameGet_(obj,'Fecha Carga'),true),
    fechaOperacion:pncxCenameSerializableDate_(pncxCenameGet_(obj,'Fecha Operacion'),false),
    anio:Number(pncxCenameGet_(obj,'Año') || 0),
    mes:Number(pncxCenameGet_(obj,'Mes') || 0),
    entorno:env,
    entornoLabel:pncxCenameEnvironmentLabel_(env),
    categoria:String(pncxCenameGet_(obj,'Categoria') || pncxCenameEnvironmentLabel_(env)),
    subcategoria:String(pncxCenameGet_(obj,'Subcategoria') || ''),
    sector:String(pncxCenameGet_(obj,'Sector') || ''),
    departamentoOperativo:String(pncxCenameGet_(obj,'Departamento Operativo') || ''),
    municipio:String(pncxCenameGet_(obj,'Municipio') || ''),
    calibraciones:Number(pncxCenameGet_(obj,'Calibraciones') || 0),
    certificados:Number(pncxCenameGet_(obj,'Certificados') || 0),
    informes:Number(pncxCenameGet_(obj,'Informes') || 0),
    estaciones:Number(pncxCenameGet_(obj,'Estaciones') || 0),
    dispensadores:Number(pncxCenameGet_(obj,'Dispensadores') || 0),
    productos:Number(pncxCenameGet_(obj,'Productos') || 0),
    productosDetalle:pncxCenameProductsToArray_(pncxCenameGet_(obj,'Productos Detalle')),
    unidades:Number(pncxCenameGet_(obj,'Unidades') || 0),
    verificaciones:Number(pncxCenameGet_(obj,'Verificaciones') || 0),
    inmovilizaciones:Number(pncxCenameGet_(obj,'Inmovilizaciones') || 0),
    clientesMes:Number(pncxCenameGet_(obj,'Clientes Mes') || pncxCenameGet_(obj,'Poblacion') || 0),
    poblacion:Number(pncxCenameGet_(obj,'Poblacion') || 0),
    huella:Number(pncxCenameGet_(obj,'Huella Economica') || 0),
    observaciones:String(pncxCenameGet_(obj,'Observaciones') || ''),
    archivo:String(pncxCenameGet_(obj,'Archivo') || ''),
    usuario:String(pncxCenameGet_(obj,'Usuario') || ''),
    origen:String(pncxCenameGet_(obj,'Origen') || 'EXCEL'),
    idExterno:String(pncxCenameGet_(obj,'ID Externo') || ''),
    idReporte:String(pncxCenameGet_(obj,'ID Externo') || ''),
    actualizado:String(pncxCenameGet_(obj,'Actualizado Externo') || ''),
    claveUnica:String(pncxCenameGet_(obj,'Clave Unica') || pncxCenameBuildKeyFromObject_(obj))
  };
}

function pncxCenameNormalizeManualPayload_(payload) {
  payload = payload || {};

  var fechaOperacion = pncxCenameRequireIsoDate_(
    payload.fechaOperacion || payload.fecha || payload.date,
    'Fecha Operacion'
  );
  var parsedDate = pncxCenameParseIsoDateStrict_(
    fechaOperacion,
    'Fecha Operacion'
  );

  var products = pncxCenameProductsToArray_(
    payload.productosDetalle || payload.productosLista || []
  );
  var environment = pncxCenameCanonicalEnvironment_(
    payload.entorno || payload.environment || payload.categoria
  );

  return {
    idRegistro:String(payload.idRegistro || '').trim(),
    fechaOperacion:fechaOperacion,
    anio:parsedDate.getFullYear(),
    mes:parsedDate.getMonth() + 1,
    entorno:environment,
    categoria:pncxCenameEnvironmentLabel_(environment),
    subcategoria:pncxCenameText_(payload.subcategoria),
    sector:pncxCenameText_(payload.sector),
    departamentoOperativo:pncxCenameText_(payload.departamentoOperativo) || 'CENAME',
    municipio:pncxCenameText_(payload.municipio),
    calibraciones:pncxCenameNumber_(payload.calibraciones),
    certificados:pncxCenameNumber_(payload.certificados),
    informes:pncxCenameNumber_(payload.informes),
    estaciones:pncxCenameNumber_(payload.estaciones),
    dispensadores:pncxCenameNumber_(payload.dispensadores),
    productos:pncxCenameNumber_(payload.productos) || products.length,
    productosDetalle:products,
    unidades:pncxCenameNumber_(payload.unidades),
    verificaciones:pncxCenameNumber_(payload.verificaciones),
    inmovilizaciones:pncxCenameNumber_(payload.inmovilizaciones),
    clientesMes:pncxCenameNumber_(payload.clientesMes),
    poblacion:pncxCenameNumber_(payload.poblacion || payload.clientesMes),
    huella:pncxCenameNumber_(payload.huella || payload.huellaEconomicaMesQ),
    observaciones:pncxCenameText_(payload.observaciones),
    hojaFuente:'MANUAL',
    filaOrigen:0,
    archivo:pncxCenameText_(payload.archivo) || 'MANUAL',
    origen:pncxCenameText_(payload.origen) || 'MANUAL',
    idExterno:pncxCenameText_(payload.idReporte || payload.idExterno || payload.id),
    actualizadoExterno:pncxCenameText_(payload.actualizado || payload.actualizadoExterno)
  };
}


// ─────────────────────────────────────────────────────────────
// ENTORNOS, SERIALIZACION, MIGRACION Y ENDPOINT JSON
// ─────────────────────────────────────────────────────────────

function pncxCenameEnvironmentList_() {
  return [
    {
      id:PNCX_CENAME_ENV.DISPENSADORES_GASOLINA.id,
      label:PNCX_CENAME_ENV.DISPENSADORES_GASOLINA.label,
      icon:'⛽',
      description:'Verificaciones de estaciones, dispensadores y combustibles.'
    },
    {
      id:PNCX_CENAME_ENV.PRODUCTO_PREEMPACADO.id,
      label:PNCX_CENAME_ENV.PRODUCTO_PREEMPACADO.label,
      icon:'📦',
      description:'Productos preempacados, contenido neto, lotes y unidades.'
    },
    {
      id:PNCX_CENAME_ENV.INSTRUMENTOS_CALIBRADOS.id,
      label:PNCX_CENAME_ENV.INSTRUMENTOS_CALIBRADOS.label,
      icon:'⚙️',
      description:'Instrumentos calibrados, certificados e informes.'
    }
  ];
}

function pncxCenameCanonicalEnvironment_(value) {
  var normalized = pncxCenameNormalizeText_(value).replace(/_/g,' ');
  if (!normalized) return '';

  var keys = Object.keys(PNCX_CENAME_ENV);
  for (var i=0;i<keys.length;i++) {
    var cfg = PNCX_CENAME_ENV[keys[i]];
    if (pncxCenameNormalizeText_(cfg.id).replace(/_/g,' ') === normalized) return cfg.id;
    if (pncxCenameNormalizeText_(cfg.label) === normalized) return cfg.id;
    for (var j=0;j<cfg.aliases.length;j++) {
      var alias = pncxCenameNormalizeText_(cfg.aliases[j]);
      if (normalized.indexOf(alias) >= 0 || alias.indexOf(normalized) >= 0) return cfg.id;
    }
  }
  return '';
}

function pncxCenameEnvironmentLabel_(environment) {
  var id = pncxCenameCanonicalEnvironment_(environment);
  if (id && PNCX_CENAME_ENV[id]) return PNCX_CENAME_ENV[id].label;
  return 'Sin clasificar';
}

function pncxCenameInferEnvironment_(text, row) {
  row = row || {};
  var direct = pncxCenameCanonicalEnvironment_(text);
  if (direct) return direct;

  var normalized = pncxCenameNormalizeText_(
    [text,row.categoria,row.subcategoria,row.sector,row.hojaFuente,row.observaciones].join(' ')
  );

  if (
    normalized.indexOf('preempacad') >= 0 ||
    normalized.indexOf('pre empacad') >= 0 ||
    normalized.indexOf('preenvasad') >= 0 ||
    normalized.indexOf('contenido neto') >= 0
  ) {
    return PNCX_CENAME_ENV.PRODUCTO_PREEMPACADO.id;
  }

  if (
    normalized.indexOf('dispensador') >= 0 ||
    normalized.indexOf('combustible') >= 0 ||
    normalized.indexOf('gasolina') >= 0 ||
    normalized.indexOf('diesel') >= 0 ||
    normalized.indexOf('estacion de servicio') >= 0 ||
    Number(row.estaciones || 0) > 0 ||
    Number(row.dispensadores || 0) > 0 ||
    Number(row.verificaciones || 0) > 0
  ) {
    return PNCX_CENAME_ENV.DISPENSADORES_GASOLINA.id;
  }

  if (
    normalized.indexOf('calibra') >= 0 ||
    normalized.indexOf('instrumento') >= 0 ||
    normalized.indexOf('metrolog') >= 0 ||
    Number(row.calibraciones || 0) > 0 ||
    Number(row.certificados || 0) > 0
  ) {
    return PNCX_CENAME_ENV.INSTRUMENTOS_CALIBRADOS.id;
  }

  if (
    Number(row.productos || 0) > 0 ||
    Number(row.unidades || 0) > 0
  ) {
    return PNCX_CENAME_ENV.PRODUCTO_PREEMPACADO.id;
  }

  return PNCX_CENAME_ENV.INSTRUMENTOS_CALIBRADOS.id;
}

function pncxCenameGetEnvironmentFromObject_(obj) {
  var direct = pncxCenameCanonicalEnvironment_(
    pncxCenameGet_(obj,'Entorno') || pncxCenameGet_(obj,'Categoria')
  );
  if (direct) return direct;

  return pncxCenameInferEnvironment_(
    [
      pncxCenameGet_(obj,'Categoria'),
      pncxCenameGet_(obj,'Subcategoria'),
      pncxCenameGet_(obj,'Sector'),
      pncxCenameGet_(obj,'Hoja Fuente'),
      pncxCenameGet_(obj,'Observaciones')
    ].join(' '),
    {
      calibraciones:pncxCenameGet_(obj,'Calibraciones'),
      certificados:pncxCenameGet_(obj,'Certificados'),
      estaciones:pncxCenameGet_(obj,'Estaciones'),
      dispensadores:pncxCenameGet_(obj,'Dispensadores'),
      productos:pncxCenameGet_(obj,'Productos'),
      unidades:pncxCenameGet_(obj,'Unidades'),
      verificaciones:pncxCenameGet_(obj,'Verificaciones')
    }
  );
}

function pncxCenameUniqueEnvironments_(rows) {
  var found = {};
  (rows || []).forEach(function(r) {
    var env = pncxCenameCanonicalEnvironment_(r.entorno || r.categoria) ||
      pncxCenameInferEnvironment_(
        [r.categoria,r.subcategoria,r.sector,r.hojaFuente].join(' '),r
      );
    if (env) found[env] = true;
  });
  return Object.keys(found);
}

function pncxCenameProductsToArray_(value) {
  if (Array.isArray(value)) {
    return value.map(pncxCenameText_).filter(Boolean).filter(function(v,i,a) {
      return a.map(pncxCenameNormalizeText_).indexOf(pncxCenameNormalizeText_(v)) === i;
    });
  }

  if (value === null || value === undefined || value === '') return [];

  if (typeof value === 'string') {
    var text = value.trim();
    if (!text) return [];
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return pncxCenameProductsToArray_(parsed);
    } catch (ignore) {}

    return text.split(/[,;|]+/).map(pncxCenameText_).filter(Boolean);
  }

  return [pncxCenameText_(value)].filter(Boolean);
}

function pncxCenameStableNumber_(value) {
  var n = pncxCenameNumber_(value);
  if (!isFinite(n)) return '0';
  return Number(n.toFixed(6)).toString();
}

function pncxCenameDateMillis_(value) {
  var d = pncxCenameParseDate_(value);
  return d ? d.getTime() : 0;
}

function pncxCenameFormatDateTime_(value) {
  var d = pncxCenameParseDate_(value);
  if (!d) return '';
  return Utilities.formatDate(
    d,
    PNCX_CENAME_CFG.timezone,
    PNCX_CENAME_CFG.dateTimeFormat
  );
}

function pncxCenameSerializableDate_(value, includeTime) {
  if (value === null || value === undefined || value === '') return '';
  var d = pncxCenameParseDate_(value);
  if (!d) return String(value);
  return includeTime ? pncxCenameFormatDateTime_(d) : pncxCenameFormatDate_(d);
}

function pncxCenameNormalizeRowToHeaders_(sheet, valuesByHeader) {
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var normalizedInput = {};
  Object.keys(valuesByHeader || {}).forEach(function(key) {
    normalizedInput[pncxCenameNormalizeKey_(key)] = valuesByHeader[key];
  });

  return headers.map(function(header) {
    var key = pncxCenameNormalizeKey_(header);
    return normalizedInput[key] !== undefined ? normalizedInput[key] : '';
  });
}

/**
 * Completa Entorno, Categoría y Clave Única para registros heredados.
 * No elimina filas y puede ejecutarse repetidamente de forma segura.
 */
function pncxCenameEnsureRecordClassification_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return {
      total:0,
      updated:0,
      normalizedDates:0,
      invalidDates:0
    };
  }

  var values = sheet.getRange(1,1,lastRow,lastColumn).getValues();
  var headers = values[0];
  var headerIndex = {};

  headers.forEach(function(header,index) {
    headerIndex[pncxCenameNormalizeKey_(header)] = index;
  });

  var updated = 0;
  var normalizedDates = 0;
  var invalidDates = 0;

  for (var r=1;r<values.length;r++) {
    var changed = false;

    if (headerIndex.fechaoperacion !== undefined) {
      var originalDate = values[r][headerIndex.fechaoperacion];

      if (originalDate !== null && originalDate !== undefined && originalDate !== '') {
        var normalizedDate = pncxCenameFormatDate_(originalDate);

        if (normalizedDate) {
          if (String(originalDate).trim() !== normalizedDate) {
            values[r][headerIndex.fechaoperacion] = normalizedDate;
            normalizedDates++;
            changed = true;
          }
        } else {
          invalidDates++;
        }
      }
    }

    var obj = {};
    headers.forEach(function(header,index) {
      var key = pncxCenameNormalizeKey_(header);
      if (key) obj[key] = values[r][index];
    });

    var environment = pncxCenameGetEnvironmentFromObject_(obj);
    var keyValue = pncxCenameBuildKeyFromObject_(obj);

    if (
      headerIndex.entorno !== undefined &&
      String(values[r][headerIndex.entorno] || '') !== environment
    ) {
      values[r][headerIndex.entorno] = environment;
      changed = true;
    }

    if (headerIndex.categoria !== undefined) {
      var label = pncxCenameEnvironmentLabel_(environment);
      if (String(values[r][headerIndex.categoria] || '') !== label) {
        values[r][headerIndex.categoria] = label;
        changed = true;
      }
    }

    if (
      headerIndex.claveunica !== undefined &&
      String(values[r][headerIndex.claveunica] || '') !== keyValue
    ) {
      values[r][headerIndex.claveunica] = keyValue;
      changed = true;
    }

    if (
      headerIndex.origen !== undefined &&
      !String(values[r][headerIndex.origen] || '').trim()
    ) {
      values[r][headerIndex.origen] = 'LEGACY';
      changed = true;
    }

    if (changed) updated++;
  }

  if (updated) {
    sheet.getRange(2,1,lastRow-1,lastColumn).setValues(values.slice(1));
  }

  pncxCenameApplyColumnNumberFormat_(sheet,'Fecha Operacion','@');

  return {
    total:lastRow-1,
    updated:updated,
    normalizedDates:normalizedDates,
    invalidDates:invalidDates
  };
}

/**
 * Recorre la hoja histórica, rellena Entorno y Clave Única y opcionalmente
 * elimina duplicados exactos. Conserva siempre la primera aparición.
 */
function pncxCenameDepurarDuplicados(sessionToken,applyChanges) {
  var lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(30000)) {
      throw new Error('Existe otra operacion en proceso.');
    }

    var session = pncxCenameValidateSession_(sessionToken);
    var user = session.user || {};
    pncxCenameAssertAccess_(user);

    var ss = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);
    var sheet = store.records;
    var objects = pncxCenameSheetToObjects_(sheet);
    var seen = {};
    var duplicateRows = [];
    var migrationUpdates = [];
    var duplicatePayloads = [];
    var invalidDates = 0;

    objects.forEach(function(obj,index) {
      var rowNumber = index + 2;
      var env = pncxCenameGetEnvironmentFromObject_(obj);
      var fechaOperacion = pncxCenameFormatDate_(
        pncxCenameGet_(obj,'Fecha Operacion')
      );

      if (!fechaOperacion) invalidDates++;

      var normalizedForKey = pncxCenameObjectToNormalizedRecord_(obj);
      if (fechaOperacion) {
        normalizedForKey.fechaOperacion = fechaOperacion;
      }

      var key = pncxCenameBuildKey_(normalizedForKey);

      migrationUpdates.push({
        row:rowNumber,
        environment:env,
        key:key,
        fechaOperacion:fechaOperacion
      });

      if (seen[key]) {
        duplicateRows.push(rowNumber);
        duplicatePayloads.push({
          row:normalizedForKey,
          clave:key,
          motivo:
            'Duplicado historico detectado durante depuracion; original en fila ' +
            seen[key]
        });
      } else {
        seen[key] = rowNumber;
      }
    });

    var shouldApply =
      applyChanges === true || String(applyChanges) === 'true';

    if (shouldApply) {
      // Evita pérdidas accidentales. Sólo habilitar después de respaldar la hoja.
      if (String(PropertiesService.getScriptProperties().getProperty('CENAME_PERMITIR_DEPURACION') || '') !== 'SI') {
        throw new Error('Depuración deshabilitada. Ejecute primero el diagnóstico y respalde los registros.');
      }
      var headerMap = pncxCenameHeaderIndexMap_(sheet);

      migrationUpdates.forEach(function(item) {
        if (headerMap.entorno) {
          sheet.getRange(item.row,headerMap.entorno).setValue(item.environment);
        }

        if (headerMap.claveunica) {
          sheet.getRange(item.row,headerMap.claveunica).setValue(item.key);
        }

        if (headerMap.categoria) {
          sheet.getRange(item.row,headerMap.categoria).setValue(
            pncxCenameEnvironmentLabel_(item.environment)
          );
        }

        if (headerMap.fechaoperacion && item.fechaOperacion) {
          sheet.getRange(item.row,headerMap.fechaoperacion)
            .setNumberFormat('@')
            .setValue(item.fechaOperacion);
        }
      });

      if (duplicatePayloads.length) {
        pncxCenameAppendDuplicates_(
          store.duplicates,
          duplicatePayloads,
          'DEPURACION-' + Utilities.formatDate(
            new Date(),
            PNCX_CENAME_CFG.timezone,
            'yyyyMMddHHmmss'
          ),
          'HISTORICO',
          pncxCenameUserName_(user)
        );
      }

      duplicateRows
        .sort(function(a,b){ return b-a; })
        .forEach(function(rowNumber) {
          sheet.deleteRow(rowNumber);
        });

      pncxCenameRebuildSummary_(ss);
      pncxCenameApplyDateFormats_(store);
    }

    return {
      success:true,
      applied:shouldApply,
      dateFormat:'YYYY-MM-DD',
      totalAnalizados:objects.length,
      fechasInvalidas:invalidDates,
      duplicadosDetectados:duplicateRows.length,
      registrosConservados:objects.length - duplicateRows.length,
      message:shouldApply
        ? 'Depuracion completada. Se eliminaron ' +
          duplicateRows.length + ' duplicados exactos.'
        : 'Analisis completado. Se detectaron ' +
          duplicateRows.length + ' duplicados exactos.'
    };
  } catch (error) {
    return pncxCenameError_('No fue posible depurar duplicados.',error);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function pncxCenameHeaderIndexMap_(sheet) {
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function(header,index) {
    map[pncxCenameNormalizeKey_(header)] = index + 1;
  });
  return map;
}

function pncxCenameObjectToNormalizedRecord_(obj) {
  return {
    fechaOperacion:pncxCenameGet_(obj,'Fecha Operacion'),
    anio:pncxCenameGet_(obj,'Año'),
    mes:pncxCenameGet_(obj,'Mes'),
    entorno:pncxCenameGetEnvironmentFromObject_(obj),
    categoria:pncxCenameGet_(obj,'Categoria'),
    subcategoria:pncxCenameGet_(obj,'Subcategoria'),
    sector:pncxCenameGet_(obj,'Sector'),
    departamentoOperativo:pncxCenameGet_(obj,'Departamento Operativo'),
    municipio:pncxCenameGet_(obj,'Municipio'),
    calibraciones:pncxCenameGet_(obj,'Calibraciones'),
    certificados:pncxCenameGet_(obj,'Certificados'),
    informes:pncxCenameGet_(obj,'Informes'),
    estaciones:pncxCenameGet_(obj,'Estaciones'),
    dispensadores:pncxCenameGet_(obj,'Dispensadores'),
    productos:pncxCenameGet_(obj,'Productos'),
    productosDetalle:pncxCenameGet_(obj,'Productos Detalle'),
    unidades:pncxCenameGet_(obj,'Unidades'),
    verificaciones:pncxCenameGet_(obj,'Verificaciones'),
    inmovilizaciones:pncxCenameGet_(obj,'Inmovilizaciones'),
    clientesMes:pncxCenameGet_(obj,'Clientes Mes'),
    poblacion:pncxCenameGet_(obj,'Poblacion'),
    huella:pncxCenameGet_(obj,'Huella Economica'),
    observaciones:pncxCenameGet_(obj,'Observaciones'),
    hojaFuente:pncxCenameGet_(obj,'Hoja Fuente'),
    filaOrigen:pncxCenameGet_(obj,'Fila Origen'),
    archivo:pncxCenameGet_(obj,'Archivo'),
    origen:pncxCenameGet_(obj,'Origen'),
    idExterno:pncxCenameGet_(obj,'ID Externo'),
    actualizadoExterno:pncxCenameGet_(obj,'Actualizado Externo')
  };
}

/**
 * Punto de entrada para el doPost principal del proyecto.
 * Params esperado:
 * {
 *   action: "CENAME_SYNC_JSON" | "CENAME_GET_JSON" | "CENAME_HEALTH",
 *   apiKey: "...",
 *   data: [ ... ],
 *   filters: { environment, year, month }
 * }
 */
function pncxCenameExternalEndpoint(params) {
  try {
    params = params || {};
    pncxCenameVerifyApiKey_(params.apiKey || params.key || params.api_key);

    var action = String(params.action || 'CENAME_SYNC_JSON').trim().toUpperCase();

    if (action === 'CENAME_HEALTH') {
      return {
        success:true,
        service:'CENAME JSON API',
        version:'4.2',
        dateFormat:'YYYY-MM-DD',
        timestamp:pncxCenameFormatDateTime_(new Date()),
        environments:pncxCenameEnvironmentList_()
      };
    }

    if (action === 'CENAME_GET_JSON') {
      return pncxCenameExternalRead_(params.filters || params);
    }

    if (action === 'CENAME_SYNC_JSON') {
      return pncxCenameImportarJson_(params.data || params.records || params.payload || []);
    }

    throw new Error('Accion externa no reconocida: ' + action);
  } catch (error) {
    return pncxCenameError_('Error en endpoint CENAME.',error);
  }
}

/**
 * Normaliza el correlativo oficial que identifica un reporte en PNCal.
 * Ejemplo: ML-VC-456-26. No se genera un identificador alterno.
 */
function pncxCenameNormalizeReporteId_(value) {
  return pncxCenameText_(value).toUpperCase();
}

/**
 * Valida la marca de última edición recibida por el endpoint y la guarda en
 * ISO-8601 UTC. Esto permite comparar versiones sin depender de la zona horaria
 * de la hoja o del navegador.
 */
function pncxCenameNormalizeExternalTimestamp_(value,fieldName) {
  fieldName = fieldName || 'actualizado';
  var text = String(value || '').trim();
  if (!text) throw new Error(fieldName + ' es obligatorio.');

  var date = new Date(text);
  if (isNaN(date.getTime())) {
    throw new Error(fieldName + ' no contiene una fecha/hora ISO valida: ' + text);
  }

  return date.toISOString();
}

function pncxCenameExternalTimestampMillis_(value) {
  var text = String(value || '').trim();
  if (!text) return 0;
  var date = new Date(text);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function pncxCenameImportarJson_(payload) {
  var lock = LockService.getScriptLock();
  var start = new Date();
  var idCarga = 'API-' + Utilities.formatDate(start,PNCX_CENAME_CFG.timezone,'yyyyMMddHHmmss') +
    '-' + Math.floor(Math.random() * 100000);

  try {
    if (!lock.tryLock(30000)) throw new Error('Existe otra sincronizacion en proceso.');

    var data = payload;
    if (typeof data === 'string') data = JSON.parse(data);
    if (data && !Array.isArray(data) && Array.isArray(data.data)) data = data.data;
    if (!Array.isArray(data)) throw new Error('El campo data debe ser un arreglo JSON.');
    if (!data.length) throw new Error('El arreglo JSON esta vacio.');
    if (data.length > 10000) throw new Error('El endpoint acepta un maximo de 10000 registros por solicitud.');

    var ss = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);
    var existingObjects = pncxCenameSheetToObjects_(store.records);

    /*
     * INDICE OFICIAL DEL UPSERT
     * ------------------------
     * ID Externo almacena el idReporte oficial (ej. ML-VC-456-26).
     * No se usa una clave calculada con métricas para decidir si insertar.
     */
    var existingByReport = {};
    existingObjects.forEach(function(obj,index) {
      var reportId = pncxCenameNormalizeReporteId_(pncxCenameGet_(obj,'ID Externo'));
      if (!reportId) return;

      var versionText = String(pncxCenameGet_(obj,'Actualizado Externo') || '').trim();
      var versionMillis = pncxCenameExternalTimestampMillis_(versionText);
      var candidate = {
        rowNumber:index + 2,
        object:obj,
        versionText:versionText,
        versionMillis:versionMillis
      };

      // Si ya existen duplicados históricos del mismo idReporte, para el UPSERT
      // se toma como fila activa la versión externa más reciente.
      if (
        !existingByReport[reportId] ||
        candidate.versionMillis >= existingByReport[reportId].versionMillis
      ) {
        existingByReport[reportId] = candidate;
      }
    });

    /*
     * Primero se consolida la propia solicitud. Si el mismo idReporte aparece
     * varias veces en un JSON, solamente sobrevive la versión con "actualizado"
     * más reciente. Las demás quedan como ignoradas, nunca como nuevas filas.
     */
    var batchByReport = {};
    var ignoredRows = [];
    var errorRows = [];

    data.forEach(function(item,index) {
      try {
        var normalized = pncxCenameNormalizeJsonRecord_(item,index);
        var reportId = pncxCenameNormalizeReporteId_(normalized.idExterno);
        var incomingMillis = pncxCenameExternalTimestampMillis_(normalized.actualizadoExterno);
        normalized.idExterno = reportId;
        normalized.claveUnica = pncxCenameBuildKey_(normalized);

        var previous = batchByReport[reportId];
        if (!previous) {
          batchByReport[reportId] = {
            row:normalized,
            index:index,
            versionMillis:incomingMillis
          };
          return;
        }

        if (incomingMillis > previous.versionMillis) {
          ignoredRows.push({
            idReporte:reportId,
            actualizado:previous.row.actualizadoExterno,
            motivo:'Version anterior reemplazada dentro del mismo JSON.'
          });
          batchByReport[reportId] = {
            row:normalized,
            index:index,
            versionMillis:incomingMillis
          };
        } else {
          ignoredRows.push({
            idReporte:reportId,
            actualizado:normalized.actualizadoExterno,
            motivo:incomingMillis === previous.versionMillis
              ? 'Misma version repetida dentro del mismo JSON.'
              : 'Version anterior dentro del mismo JSON.'
          });
        }
      } catch (error) {
        errorRows.push({
          index:index,
          message:error.message || String(error),
          payload:item
        });
      }
    });

    var insertRows = [];
    var updateRows = [];

    Object.keys(batchByReport).forEach(function(reportId) {
      var incoming = batchByReport[reportId];
      var existing = existingByReport[reportId];

      if (!existing) {
        if (incoming.row._sinActividad) {
          ignoredRows.push({idReporte:reportId,motivo:'Sin actividad cuantificable: no se creó un registro vacío.'});
        } else {
          insertRows.push(incoming.row);
        }
        return;
      }

      var incomingMillis = incoming.versionMillis;
      var storedMillis = existing.versionMillis;

      // Registros heredados con ID Externo pero sin Actualizado Externo se
      // consideran sin versión y aceptan la primera sincronización moderna.
      if (!storedMillis || incomingMillis > storedMillis) {
        // Mantener métricas/campos anteriores cuando el JSON es una actualización parcial.
        incoming.row = pncxCenameMergePartialReport_(incoming.row,existing.object);
        updateRows.push({
          row:incoming.row,
          rowNumber:existing.rowNumber,
          existing:existing.object
        });
        return;
      }

      ignoredRows.push({
        idReporte:reportId,
        actualizado:incoming.row.actualizadoExterno,
        actualizadoGuardado:existing.versionText,
        motivo:incomingMillis === storedMillis
          ? 'Misma version ya almacenada.'
          : 'Version recibida mas antigua que la almacenada.'
      });
    });

    var end = new Date();
    var userName = 'API EXTERNA';
    var debugRows = [];

    if (insertRows.length) {
      var rowsToAppend = insertRows.map(function(r,index) {
        return pncxCenameRecordToArray_(
          'REG-' + idCarga + '-' + (index + 1),
          idCarga,start,r,'JSON_ENDPOINT',userName,end,store.records
        );
      });
      store.records.getRange(
        store.records.getLastRow()+1,1,rowsToAppend.length,rowsToAppend[0].length
      ).setValues(rowsToAppend);
    }

    updateRows.forEach(function(item) {
      var currentIdRegistro = String(
        pncxCenameGet_(item.existing,'ID Registro') || ''
      ).trim();
      if (!currentIdRegistro) {
        currentIdRegistro = 'REG-' + idCarga + '-UPD-' + item.rowNumber;
      }

      var originalFechaCarga = pncxCenameGet_(item.existing,'Fecha Carga') || start;
      var rowArray = pncxCenameRecordToArray_(
        currentIdRegistro,
        idCarga,
        originalFechaCarga,
        item.row,
        'JSON_ENDPOINT',
        userName,
        end,
        store.records
      );

      store.records.getRange(item.rowNumber,1,1,rowArray.length).setValues([rowArray]);

      pncxCenameDebugPush_(
        debugRows,idCarga,'INFO','UPSERT_UPDATE','',item.rowNumber,
        currentIdRegistro,item.row.claveUnica,
        'Reporte actualizado por idReporte: ' + item.row.idExterno,
        {
          idReporte:item.row.idExterno,
          actualizado:item.row.actualizadoExterno
        },
        {name:userName}
      );
    });

    insertRows.forEach(function(item) {
      pncxCenameDebugPush_(
        debugRows,idCarga,'INFO','UPSERT_INSERT','','','',item.claveUnica,
        'Nuevo reporte insertado por idReporte: ' + item.idExterno,
        {
          idReporte:item.idExterno,
          actualizado:item.actualizadoExterno
        },
        {name:userName}
      );
    });

    ignoredRows.slice(0,200).forEach(function(item) {
      pncxCenameDebugPush_(
        debugRows,idCarga,'INFO','UPSERT_IGNORE','','','','',
        item.motivo || 'Version ignorada.',item,{name:userName}
      );
    });

    errorRows.slice(0,100).forEach(function(item) {
      pncxCenameDebugPush_(
        debugRows,idCarga,'ERROR','API_JSON_ERROR','','',String(item.index),'',
        item.message || 'Error normalizando registro JSON.',
        item.payload || {},{name:userName}
      );
    });

    var affectedRows = insertRows.concat(updateRows.map(function(item){ return item.row; }));
    var validRows = Object.keys(batchByReport).map(function(key){ return batchByReport[key].row; });
    var environments = pncxCenameUniqueEnvironments_(affectedRows.length ? affectedRows : validRows);
    var totalHuella = affectedRows.reduce(function(a,r){ return a + Number(r.huella || 0); },0);
    var totalPopulation = affectedRows.reduce(function(a,r){ return a + Number(r.poblacion || r.clientesMes || 0); },0);
    var totalVerifications = affectedRows.reduce(function(a,r){ return a + Number(r.verificaciones || 0); },0);
    var referenceYear = validRows.length ? Number(validRows[0].anio || new Date().getFullYear()) : new Date().getFullYear();

    store.loads.appendRow(pncxCenameNormalizeRowToHeaders_(store.loads,{
      'ID Carga':idCarga,
      'Fecha Carga':start,
      'Archivo':'JSON_ENDPOINT',
      'Tipo Detectado':pncxCenameInferType_(affectedRows.length ? affectedRows : validRows),
      'Registros Insertados':insertRows.length,
      'Registros Actualizados':updateRows.length,
      'Registros Ignorados':ignoredRows.length,
      'Huella Economica':totalHuella,
      'Usuario':userName,
      'Departamento':'CENAME',
      'Año Referencia':referenceYear,
      'Hojas Leidas':'JSON',
      'Estado':(insertRows.length || updateRows.length) ? 'OK' : 'SIN_DATOS',
      'Detalle':'Recibidos: ' + data.length +
        ' | Insertados: ' + insertRows.length +
        ' | Actualizados: ' + updateRows.length +
        ' | Ignorados: ' + ignoredRows.length +
        ' | Errores: ' + errorRows.length,
      'Timestamp Inicio':start,
      'Timestamp Fin':end,
      'Duracion ms':end.getTime()-start.getTime(),
      'Registros Leidos':data.length,
      'Registros Validos':validRows.length,
      'Registros Duplicados':0,
      'Registros Omitidos':0,
      'Registros con Error':errorRows.length,
      'Poblacion':totalPopulation,
      'Verificaciones Detectadas':totalVerifications,
      'Origen':'API_JSON',
      'Entornos Detectados':environments.join(',')
    }));

    if (debugRows.length) {
      pncxCenameAppendDebug_(store.debug,debugRows);
    }

    pncxCenameRebuildSummary_(ss);
    pncxCenameApplyDateFormats_(store);
    SpreadsheetApp.flush();

    return {
      success:true,
      message:'Sincronizacion UPSERT completada por idReporte.',
      idCarga:idCarga,
      upsertKey:'idReporte',
      versionField:'actualizado',
      received:data.length,
      inserted:insertRows.length,
      updated:updateRows.length,
      ignored:ignoredRows.length,
      duplicates:0,
      errors:errorRows.length,
      environments:environments,
      ignoredDetails:ignoredRows.slice(0,50),
      errorDetails:errorRows.slice(0,50),
      dateFormat:'YYYY-MM-DD',
      timestamp:pncxCenameFormatDateTime_(end)
    };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/** Une un reporte nuevo con su versión almacenada por idReporte (no por métricas). */
function pncxCenameMergePartialReport_(incoming,existing) {
  var fields = {
    calibraciones:'Calibraciones',certificados:'Certificados',informes:'Informes',
    estaciones:'Estaciones',dispensadores:'Dispensadores',productos:'Productos',
    productosDetalle:'Productos Detalle',unidades:'Unidades',verificaciones:'Verificaciones',
    inmovilizaciones:'Inmovilizaciones',clientesMes:'Clientes Mes',
    poblacion:'Poblacion',huella:'Huella Economica',observaciones:'Observaciones',
    sector:'Sector',subcategoria:'Subcategoria',departamentoOperativo:'Departamento Operativo',
    municipio:'Municipio'
  };
  var presentes=incoming._presentes || {};
  Object.keys(fields).forEach(function(field) {
    if (presentes[field]) return;
    var saved=pncxCenameGet_(existing,fields[field]);
    if (saved === undefined || saved === null || saved === '') return;
    incoming[field]=field==='productosDetalle'
      ? pncxCenameProductsToArray_(saved)
      : (['sector','subcategoria','departamentoOperativo','municipio','observaciones'].indexOf(field)>=0
        ? String(saved) : Number(saved)||0);
  });
  incoming.claveUnica=pncxCenameBuildKey_(incoming);
  return incoming;
}

function pncxCenameNormalizeJsonRecord_(item,index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Registro JSON invalido en indice ' + index + '.');
  }

  var idReporte = pncxCenameNormalizeReporteId_(
    item.idReporte || item.id_reporte || item.idExterno || item.externalId || item.id
  );
  if (!idReporte) {
    throw new Error(
      'data[' + index + '].idReporte es obligatorio para CENAME_SYNC_JSON.'
    );
  }

  var actualizadoExterno = pncxCenameNormalizeExternalTimestamp_(
    item.actualizado || item.updatedAt || item.fechaActualizacion,
    'data[' + index + '].actualizado'
  );

  var unit = pncxCenameText_(
    item.unidad || item.environment || item.entorno || item.categoria
  );
  var environment = pncxCenameCanonicalEnvironment_(unit) ||
    pncxCenameInferEnvironment_(
      [unit,item.tipo,item.subcategoria,item.producto,item.instrumento].join(' '),
      item
    );

  var date = pncxCenameRequireIsoDate_(
    item.fecha || item.fechaOperacion || item.date,
    'data[' + index + '].fecha'
  );
  var parsedDate = pncxCenameParseIsoDateStrict_(
    date,
    'data[' + index + '].fecha'
  );

  var products = pncxCenameProductsToArray_(
    item.productos || item.productosDetalle || item.combustibles || []
  );

  var normalized = {
    fechaOperacion:date,
    anio:parsedDate.getFullYear(),
    mes:parsedDate.getMonth() + 1,
    entorno:environment,
    categoria:pncxCenameEnvironmentLabel_(environment),
    subcategoria:pncxCenameText_(
      item.subcategoria || item.instrumento || item.producto || unit
    ),
    sector:pncxCenameText_(item.sector || item.tipo || ''),
    departamentoOperativo:pncxCenameText_(
      item.departamento || item.departamentoOperativo || 'CENAME'
    ),
    municipio:pncxCenameText_(item.municipio || ''),
    calibraciones:pncxCenameNumber_(item.calibraciones || item.instrumentosCalibrados),
    certificados:pncxCenameNumber_(item.certificados),
    informes:pncxCenameNumber_(item.informes),
    estaciones:pncxCenameNumber_(item.estaciones),
    dispensadores:pncxCenameNumber_(item.dispensadores),
    productos:pncxCenameNumber_(
      item.cantidadProductos || item.productosVerificados
    ) || products.length,
    productosDetalle:products,
    unidades:pncxCenameNumber_(item.unidades || item.lotes),
    verificaciones:pncxCenameNumber_(item.verificaciones),
    inmovilizaciones:pncxCenameNumber_(item.inmovilizaciones),
    clientesMes:pncxCenameNumber_(item.clientesMes || item.clientes),
    poblacion:pncxCenameNumber_(
      item.poblacion || item.clientesMes || item.clientes
    ),
    huella:pncxCenameNumber_(
      item.huellaEconomicaMesQ || item.huellaEconomica || item.huella
    ),
    observaciones:pncxCenameText_(item.observaciones),
    hojaFuente:'API_JSON',
    filaOrigen:index + 1,
    archivo:'JSON_ENDPOINT',
    origen:'API_JSON',
    idExterno:idReporte,
    actualizadoExterno:actualizadoExterno
  };

  normalized.claveUnica = pncxCenameBuildKey_(normalized);
  // Información operacional opcional: distingue campo omitido de cero explícito.
  var families = {
    calibraciones:['calibraciones','instrumentosCalibrados'],
    certificados:['certificados'], informes:['informes'],
    estaciones:['estaciones'], dispensadores:['dispensadores'],
    productos:['cantidadProductos','productosVerificados','productos','productosDetalle','combustibles'],
    productosDetalle:['productos','productosDetalle','combustibles'],
    unidades:['unidades','lotes'], verificaciones:['verificaciones'],
    inmovilizaciones:['inmovilizaciones'], clientesMes:['clientesMes','clientes'],
    poblacion:['poblacion','clientesMes','clientes'],
    huella:['huellaEconomicaMesQ','huellaEconomica','huella'],
    observaciones:['observaciones'],sector:['sector','tipo'],
    subcategoria:['subcategoria','instrumento','producto','unidad'],
    departamentoOperativo:['departamento','departamentoOperativo'],municipio:['municipio']
  };
  normalized._presentes = {};
  Object.keys(families).forEach(function(field){
    normalized._presentes[field] = families[field].some(function(key){
      return Object.prototype.hasOwnProperty.call(item,key);
    });
  });
  normalized._sinActividad = !pncxCenameHasActivity_(normalized);
  // Las filas sin actividad NO generan indicadores artificiales ni nuevos registros.
  // Cuando el idReporte ya existe, sí pueden completar metadatos en una versión posterior.
  return normalized;
}

function pncxCenameExternalRead_(filters) {
  filters = filters || {};
  var ss = pncxCenameOpenSpreadsheet_();
  var store = pncxCenameEnsureSheets_(ss);
  var records = pncxCenameSheetToObjects_(store.records);
  var environment = pncxCenameCanonicalEnvironment_(
    filters.environment || filters.entorno || ''
  );
  var year = String(filters.year || '').trim();
  var month = String(filters.month || '').trim();
  var limit = Math.max(1,Math.min(Number(filters.limit || 1000),10000));

  var rows = records.filter(function(obj) {
    if (environment && pncxCenameGetEnvironmentFromObject_(obj) !== environment) return false;
    if (year && String(pncxCenameGet_(obj,'Año') || '') !== year) return false;
    if (month && String(pncxCenameGet_(obj,'Mes') || '') !== month) return false;
    return true;
  }).slice(-limit).map(pncxCenameObjectToUi_);

  return {
    success:true,
    count:rows.length,
    filters:{
      environment:environment,
      year:year,
      month:month,
      limit:limit
    },
    dateFormat:'YYYY-MM-DD',
    data:rows,
    timestamp:pncxCenameFormatDateTime_(new Date())
  };
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

function pncxCenameValidateSession_(sessionToken){
  if(typeof validateSession==='function'){
    var session=validateSession(sessionToken);
    if(!session||!session.valid) throw new Error('Sesion invalida o expirada.');
    return session;
  }
  return {valid:true,user:{role:'Administrador',department:'CENAME',name:'Usuario local'}};
}

function pncxCenameAssertAccess_(user){ if(!pncxCenameCanAccess_(user)) throw new Error('No tienes permisos para usar el modulo CENAME.'); }

function pncxCenameCanAccess_(user){
  user=user||{};
  var role=String(user.role||'').trim(); var dept=String(user.department||'').trim();
  if(role==='Administrador') return true;
  return (role==='Usuario'||role==='Jefe')&&dept==='CENAME';
}

function pncxCenameUserName_(user){ return (user&&(user.name||user.username||user.email))||'Usuario CENAME'; }

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function pncxCenameEmptyRow_(row){return row.every(function(v){return String(v||'').trim()==='';});}
function pncxCenameTotalRow_(row){var j=pncxCenameNormalizeText_(row.join(' '));return j.indexOf('total general')>=0||j.indexOf('subtotal')>=0||j.indexOf('grand total')>=0||j.indexOf('acumulado')>=0;}
function pncxCenamePivotNoiseRow_(row){var j=pncxCenameNormalizeText_(row.join(' '));return j.indexOf('etiquetas de fila')>=0||j.indexOf('etiquetas de columna')>=0||j.indexOf('(en blanco)')>=0||j.indexOf('suma de ')>=0;}
function pncxCenameValueByMap_(row,map,key){if(map[key]===undefined) return '';return row[map[key]];}
function pncxCenameInferCategory_(sheetName,subcategoria,calibraciones,certificados,informes,estaciones,dispensadores,productos) {
  var env = pncxCenameInferEnvironment_(
    [sheetName,subcategoria].join(' '),
    {
      calibraciones:calibraciones,
      certificados:certificados,
      informes:informes,
      estaciones:estaciones,
      dispensadores:dispensadores,
      productos:productos
    }
  );
  return pncxCenameEnvironmentLabel_(env);
}
function pncxCenameInferType_(rows) {
  var envs = {};
  (rows || []).forEach(function(r) {
    var env = pncxCenameCanonicalEnvironment_(r.entorno || r.categoria) ||
      pncxCenameInferEnvironment_(
        [r.categoria,r.subcategoria,r.sector,r.hojaFuente].join(' '),r
      );
    if (env) envs[env] = true;
  });
  var keys = Object.keys(envs);
  if (!keys.length) return 'Sin clasificar';
  if (keys.length === 1) return pncxCenameEnvironmentLabel_(keys[0]);
  return 'Mixto: ' + keys.map(pncxCenameEnvironmentLabel_).join(', ');
}
function pncxCenameResolveYear_(fecha,anioDirecto,anioHint){
  if(anioDirecto&&!isNaN(Number(anioDirecto))) return Number(anioDirecto);
  var d=pncxCenameParseDate_(fecha); if(d) return d.getFullYear();
  if(anioHint&&!isNaN(Number(anioHint))) return Number(anioHint);
  return new Date().getFullYear();
}
function pncxCenameResolveMonth_(fecha,mesDirecto){
  if(mesDirecto&&!isNaN(Number(mesDirecto))) return Number(mesDirecto);
  var months={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  var txt=pncxCenameNormalizeText_(mesDirecto);if(months[txt])return months[txt];
  var d=pncxCenameParseDate_(fecha);return d?d.getMonth()+1:'';
}

/**
 * Construye una fecha local validada sin aplicar conversion UTC.
 * Se utiliza mediodia para impedir cambios de dia por zona horaria.
 */
function pncxCenameBuildValidatedDate_(year,month,day) {
  year = Number(year);
  month = Number(month);
  day = Number(day);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1000 || year > 9999 ||
    month < 1 || month > 12 ||
    day < 1 || day > 31
  ) {
    return null;
  }

  var date = new Date(year,month - 1,day,12,0,0,0);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Valida estrictamente una fecha internacional ISO 8601 de calendario.
 * Formato permitido: YYYY-MM-DD.
 * Rechaza formatos ambiguos y fechas imposibles como 2026-02-30.
 */
function pncxCenameParseIsoDateStrict_(value,fieldName) {
  fieldName = String(fieldName || 'Fecha').trim();

  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return pncxCenameBuildValidatedDate_(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }

  var text = String(value === null || value === undefined ? '' : value).trim();

  if (!text) {
    throw new Error(
      fieldName + ' es obligatoria y debe usar el formato YYYY-MM-DD.'
    );
  }

  if (!PNCX_CENAME_CFG.datePattern.test(text)) {
    throw new Error(
      fieldName + ' invalida: "' + text +
      '". Use exclusivamente el formato internacional YYYY-MM-DD.'
    );
  }

  var parts = text.split('-');
  var date = pncxCenameBuildValidatedDate_(
    Number(parts[0]),
    Number(parts[1]),
    Number(parts[2])
  );

  if (!date) {
    throw new Error(
      fieldName + ' contiene una fecha inexistente: "' + text +
      '". Use una fecha real en formato YYYY-MM-DD.'
    );
  }

  return date;
}

/**
 * Valida y devuelve siempre una fecha textual YYYY-MM-DD.
 */
function pncxCenameRequireIsoDate_(value,fieldName) {
  var date = pncxCenameParseIsoDateStrict_(value,fieldName);
  return Utilities.formatDate(
    date,
    PNCX_CENAME_CFG.timezone,
    PNCX_CENAME_CFG.dateFormat
  );
}

/**
 * Aplica formato de visualizacion a una columna por nombre de encabezado.
 */
function pncxCenameApplyColumnNumberFormat_(sheet,headerName,numberFormat) {
  if (!sheet || !headerName || !numberFormat || sheet.getLastColumn() < 1) return;

  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var target = pncxCenameNormalizeKey_(headerName);
  var column = 0;

  for (var i=0;i<headers.length;i++) {
    if (pncxCenameNormalizeKey_(headers[i]) === target) {
      column = i + 1;
      break;
    }
  }

  if (!column || sheet.getMaxRows() < 2) return;
  sheet.getRange(2,column,sheet.getMaxRows()-1,1).setNumberFormat(numberFormat);
}

/**
 * Configura las hojas para mostrar fechas en orden internacional.
 * Fecha Operacion se conserva como texto ISO para impedir que la
 * configuracion regional de Google Sheets invierta dia y mes.
 */
function pncxCenameApplyDateFormats_(store) {
  store = store || {};

  if (store.records) {
    pncxCenameApplyColumnNumberFormat_(store.records,'Fecha Operacion','@');
    pncxCenameApplyColumnNumberFormat_(store.records,'Actualizado Externo','@');
    pncxCenameApplyColumnNumberFormat_(store.records,'Fecha Carga','yyyy-mm-dd hh:mm:ss');
    pncxCenameApplyColumnNumberFormat_(store.records,'Timestamp Sistema','yyyy-mm-dd hh:mm:ss');
  }

  if (store.loads) {
    pncxCenameApplyColumnNumberFormat_(store.loads,'Fecha Carga','yyyy-mm-dd hh:mm:ss');
    pncxCenameApplyColumnNumberFormat_(store.loads,'Timestamp Inicio','yyyy-mm-dd hh:mm:ss');
    pncxCenameApplyColumnNumberFormat_(store.loads,'Timestamp Fin','yyyy-mm-dd hh:mm:ss');
  }

  if (store.summary) {
    pncxCenameApplyColumnNumberFormat_(store.summary,'Periodo','@');
    pncxCenameApplyColumnNumberFormat_(store.summary,'Ultima Actualizacion','yyyy-mm-dd hh:mm:ss');
  }

  if (store.debug) {
    pncxCenameApplyColumnNumberFormat_(store.debug,'Timestamp','yyyy-mm-dd hh:mm:ss');
  }

  if (store.duplicates) {
    pncxCenameApplyColumnNumberFormat_(store.duplicates,'Fecha Operacion','@');
    pncxCenameApplyColumnNumberFormat_(store.duplicates,'Actualizado Externo','@');
    pncxCenameApplyColumnNumberFormat_(store.duplicates,'Timestamp','yyyy-mm-dd hh:mm:ss');
  }
}

/**
 * Convierte una columna historica a YYYY-MM-DD cuando el valor puede
 * interpretarse de forma segura. Los valores no reconocidos se conservan
 * y se reportan como invalidos para no perder informacion.
 */
function pncxCenameNormalizeExistingDateColumn_(sheet,headerName) {
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    return {total:0,updated:0,invalid:0};
  }

  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var target = pncxCenameNormalizeKey_(headerName);
  var column = 0;

  for (var i=0;i<headers.length;i++) {
    if (pncxCenameNormalizeKey_(headers[i]) === target) {
      column = i + 1;
      break;
    }
  }

  if (!column) return {total:0,updated:0,invalid:0};

  var rowCount = sheet.getLastRow() - 1;
  var values = sheet.getRange(2,column,rowCount,1).getValues();
  var updated = 0;
  var invalid = 0;

  values.forEach(function(row) {
    var original = row[0];
    if (original === null || original === undefined || original === '') return;

    var iso = pncxCenameFormatDate_(original);
    if (!iso) {
      invalid++;
      return;
    }

    if (String(original).trim() !== iso) {
      row[0] = iso;
      updated++;
    }
  });

  if (updated) {
    sheet.getRange(2,column,rowCount,1).setValues(values);
  }

  sheet.getRange(2,column,Math.max(rowCount,1),1).setNumberFormat('@');
  return {total:rowCount,updated:updated,invalid:invalid};
}

/**
 * Prueba rapida para ejecutar manualmente desde Apps Script.
 */
function pncxCenameProbarFormatoFechaISO() {
  var valid = pncxCenameRequireIsoDate_('2026-07-30','fecha');
  var rejectedFormat = false;
  var rejectedImpossible = false;

  try {
    pncxCenameRequireIsoDate_('30/07/2026','fecha');
  } catch (error1) {
    rejectedFormat = true;
  }

  try {
    pncxCenameRequireIsoDate_('2026-02-30','fecha');
  } catch (error2) {
    rejectedImpossible = true;
  }

  return {
    success:valid === '2026-07-30' && rejectedFormat && rejectedImpossible,
    accepted:valid,
    rejectedNonIso:rejectedFormat,
    rejectedImpossibleDate:rejectedImpossible,
    requiredFormat:'YYYY-MM-DD'
  };
}

function pncxCenameParseDate_(value) {
  if (value === null || value === undefined || value === '') return null;

  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return new Date(value.getTime());
  }

  /*
   * Fechas seriales de Excel/Google Sheets.
   * Se reconstruyen al mediodia local para evitar que el huso horario
   * cambie el dia al convertirlo a YYYY-MM-DD.
   */
  if (typeof value === 'number' && isFinite(value) && value > 0) {
    var excelUtc = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(excelUtc.getTime())) return null;
    return new Date(
      excelUtc.getUTCFullYear(),
      excelUtc.getUTCMonth(),
      excelUtc.getUTCDate(),
      12,0,0,0
    );
  }

  var str = String(value).trim();
  if (!str) return null;

  /*
   * Formato oficial y no ambiguo: YYYY-MM-DD.
   */
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    try {
      return pncxCenameParseIsoDateStrict_(str,'Fecha');
    } catch (invalidIsoDate) {
      return null;
    }
  }

  /*
   * Timestamp ISO 8601. Se permite solamente para campos de fecha/hora
   * internos; al solicitar fecha simple se devolverá YYYY-MM-DD.
   */
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    var isoDateTime = new Date(str);
    return isNaN(isoDateTime.getTime()) ? null : isoDateTime;
  }

  /*
   * Compatibilidad exclusiva para datos historicos o Excel:
   * DD/MM/YYYY, DD-MM-YYYY y YYYY/MM/DD.
   * El endpoint JSON y el formulario manual NO usan esta tolerancia:
   * ambos llaman pncxCenameRequireIsoDate_().
   */
  var m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return pncxCenameBuildValidatedDate_(
      Number(m[3]),Number(m[2]),Number(m[1])
    );
  }

  m = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return pncxCenameBuildValidatedDate_(
      Number(m[1]),Number(m[2]),Number(m[3])
    );
  }

  return null;
}
function pncxCenameFormatDate_(value) {
  var d = pncxCenameParseDate_(value);
  if (!d) return '';
  return Utilities.formatDate(
    d,
    PNCX_CENAME_CFG.timezone,
    PNCX_CENAME_CFG.dateFormat
  );
}
function pncxCenameNumber_(value){
  if(value===null||value===undefined||value==='') return 0;
  if(typeof value==='number') return value;
  var s=String(value).trim();if(!s)return 0;
  s=s.replace(/[Qq$\s]/g,'');
  if(/^\d{1,3}(\.\d{3})+,\d+$/.test(s)){s=s.replace(/\./g,'').replace(',','.');}
  else if(/^\d+,\d+$/.test(s)){s=s.replace(',','.');}
  else{s=s.replace(/,/g,'');}
  s=s.replace(/[^\d.\-]/g,'');var n=parseFloat(s);return isNaN(n)?0:n;
}
function pncxCenameHasActivity_(obj) {
  obj = obj || {};
  return Number(obj.calibraciones || 0) > 0 ||
    Number(obj.certificados || 0) > 0 ||
    Number(obj.informes || 0) > 0 ||
    Number(obj.estaciones || 0) > 0 ||
    Number(obj.dispensadores || 0) > 0 ||
    Number(obj.productos || 0) > 0 ||
    Number(obj.unidades || 0) > 0 ||
    Number(obj.verificaciones || 0) > 0 ||
    Number(obj.inmovilizaciones || 0) > 0 ||
    Number(obj.clientesMes || 0) > 0 ||
    Number(obj.poblacion || 0) > 0 ||
    Number(obj.huella || 0) > 0;
}
function pncxCenameText_(value){return String(value||'').replace(/\s+/g,' ').trim();}
function pncxCenameNormalizeText_(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}
function pncxCenameContainsAlias_(text,aliases){var t=pncxCenameNormalizeText_(text);return aliases.some(function(a){var alias=pncxCenameNormalizeText_(a);return t.indexOf(alias)>=0||alias.indexOf(t)>=0;});}

function pncxCenameBuildKey_(r) {
  r = r || {};

  var externalId = pncxCenameNormalizeText_(
    r.idReporte || r.idExterno || ''
  );
  if (externalId) {
    // Para datos externos, la identidad es exclusivamente el correlativo
    // oficial del reporte. Cambiar métricas, tipo u origen no crea otra fila.
    return 'external|' + externalId;
  }

  var environment = pncxCenameCanonicalEnvironment_(r.entorno || r.categoria) ||
    pncxCenameInferEnvironment_(
      [r.categoria,r.subcategoria,r.sector,r.hojaFuente].join(' '),r
    );

  var products = pncxCenameProductsToArray_(r.productosDetalle)
    .map(pncxCenameNormalizeText_)
    .sort()
    .join(',');

  var values = [
    environment,
    pncxCenameFormatDate_(r.fechaOperacion) || String(r.fechaOperacion || ''),
    r.departamentoOperativo || '',
    r.municipio || '',
    r.subcategoria || '',
    r.sector || '',
    products,
    pncxCenameStableNumber_(r.calibraciones),
    pncxCenameStableNumber_(r.certificados),
    pncxCenameStableNumber_(r.informes),
    pncxCenameStableNumber_(r.estaciones),
    pncxCenameStableNumber_(r.dispensadores),
    pncxCenameStableNumber_(r.productos),
    pncxCenameStableNumber_(r.unidades),
    pncxCenameStableNumber_(r.verificaciones),
    pncxCenameStableNumber_(r.inmovilizaciones),
    pncxCenameStableNumber_(r.clientesMes || r.poblacion),
    pncxCenameStableNumber_(r.huella)
  ];

  return values.map(function(v) {
    return pncxCenameNormalizeText_(v);
  }).join('|');
}

function pncxCenameBuildKeyFromObject_(obj) {
  obj = obj || {};

  var externalId = String(pncxCenameGet_(obj,'ID Externo') || '').trim();
  if (externalId) {
    return pncxCenameBuildKey_({
      idExterno:externalId,
      idReporte:externalId
    });
  }

  var stored = String(pncxCenameGet_(obj,'Clave Unica') || '').trim();
  if (stored) return stored;

  return pncxCenameBuildKey_({
    fechaOperacion:pncxCenameGet_(obj,'Fecha Operacion'),
    entorno:pncxCenameGetEnvironmentFromObject_(obj),
    categoria:pncxCenameGet_(obj,'Categoria'),
    subcategoria:pncxCenameGet_(obj,'Subcategoria'),
    sector:pncxCenameGet_(obj,'Sector'),
    departamentoOperativo:pncxCenameGet_(obj,'Departamento Operativo'),
    municipio:pncxCenameGet_(obj,'Municipio'),
    calibraciones:pncxCenameGet_(obj,'Calibraciones'),
    certificados:pncxCenameGet_(obj,'Certificados'),
    informes:pncxCenameGet_(obj,'Informes'),
    estaciones:pncxCenameGet_(obj,'Estaciones'),
    dispensadores:pncxCenameGet_(obj,'Dispensadores'),
    productos:pncxCenameGet_(obj,'Productos'),
    productosDetalle:pncxCenameGet_(obj,'Productos Detalle'),
    unidades:pncxCenameGet_(obj,'Unidades'),
    verificaciones:pncxCenameGet_(obj,'Verificaciones'),
    inmovilizaciones:pncxCenameGet_(obj,'Inmovilizaciones'),
    clientesMes:pncxCenameGet_(obj,'Clientes Mes') || pncxCenameGet_(obj,'Poblacion'),
    poblacion:pncxCenameGet_(obj,'Poblacion'),
    huella:pncxCenameGet_(obj,'Huella Economica')
  });
}

/**
 * Diagnóstico manual y no destructivo para confirmar que la estructura del
 * UPSERT quedó instalada. No inserta, actualiza ni elimina registros.
 */
function pncxCenameDiagnosticoUpsert() {
  try {
    var ss = pncxCenameOpenSpreadsheet_();
    var store = pncxCenameEnsureSheets_(ss);
    var headers = store.records.getRange(1,1,1,store.records.getLastColumn()).getValues()[0];
    var normalizedHeaders = headers.map(pncxCenameNormalizeKey_);
    var required = ['ID Externo','Actualizado Externo','Clave Unica'];
    var missing = required.filter(function(header) {
      return normalizedHeaders.indexOf(pncxCenameNormalizeKey_(header)) < 0;
    });

    var records = pncxCenameSheetToObjects_(store.records);
    var countByReport = {};
    records.forEach(function(obj) {
      var id = pncxCenameNormalizeReporteId_(pncxCenameGet_(obj,'ID Externo'));
      if (!id) return;
      countByReport[id] = (countByReport[id] || 0) + 1;
    });

    var duplicates = Object.keys(countByReport).filter(function(id) {
      return countByReport[id] > 1;
    }).map(function(id) {
      return {idReporte:id,cantidad:countByReport[id]};
    });

    return {
      success:missing.length === 0,
      version:'4.2',
      mode:'UPSERT',
      upsertKey:'idReporte',
      versionField:'actualizado',
      missingHeaders:missing,
      totalRecords:records.length,
      reportIds:Object.keys(countByReport).length,
      existingDuplicateReportIds:duplicates,
      message:missing.length
        ? 'Faltan columnas requeridas para UPSERT.'
        : 'Estructura UPSERT lista. No se modificaron registros.'
    };
  } catch (error) {
    return pncxCenameError_('No fue posible diagnosticar el UPSERT.',error);
  }
}

function pncxCenameError_(message,error,extra){
  var payload={success:false,message:message+' '+(error&&error.message?error.message:String(error||''))};
  if(extra&&typeof extra==='object'){Object.keys(extra).forEach(function(k){payload[k]=extra[k];});}
  Logger.log(payload.message+'\n'+(error&&error.stack?error.stack:''));
  return payload;
}