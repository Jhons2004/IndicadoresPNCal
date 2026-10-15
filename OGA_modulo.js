// ====================================
// OGA_Module.gs - Dashboard OGA Segmentado
// Versión: Segmentación Acreditados / Reconocidos
// Compatible con CODE.GS principal: handleOGAAction(action, params, session)
// ====================================

var OGA_SS_ID = '1Mywtx5VxzV06SU9PjnBBDda8vDBoaqr_QOBLFTPpLP8';

var OGA_SHEETS = {
  COMPILADO:     'Compilado',
  CLIENTES:      'Clientes',
  SITIOS:        'Sitios',
  CICLOS:        'Copy of Ciclos',
  EVENTOS:       'Eventos_Asistencia',
  TABLERO:       'Tablero'
};

var OGA_MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

var OGA_SEGMENTOS = {
  ACREDITADOS: 'Acreditados',
  RECONOCIDOS: 'Reconocidos'
};

var OGA_COORDS = {
  'guatemala':        { lat: 14.6349, lng: -90.5069, label: 'Guatemala', pais: 'Guatemala' },
  'guatemala capital':{ lat: 14.6349, lng: -90.5069, label: 'Guatemala', pais: 'Guatemala' },
  'alta verapaz':     { lat: 15.5943, lng: -90.1495, label: 'Alta Verapaz', pais: 'Guatemala' },
  'baja verapaz':     { lat: 15.1037, lng: -90.3181, label: 'Baja Verapaz', pais: 'Guatemala' },
  'chimaltenango':    { lat: 14.6611, lng: -90.8194, label: 'Chimaltenango', pais: 'Guatemala' },
  'chiquimula':       { lat: 14.8000, lng: -89.5458, label: 'Chiquimula', pais: 'Guatemala' },
  'el progreso':      { lat: 14.8542, lng: -90.0647, label: 'El Progreso', pais: 'Guatemala' },
  'escuintla':        { lat: 14.3050, lng: -90.7850, label: 'Escuintla', pais: 'Guatemala' },
  'huehuetenango':    { lat: 15.3192, lng: -91.4724, label: 'Huehuetenango', pais: 'Guatemala' },
  'izabal':           { lat: 15.7306, lng: -88.5944, label: 'Izabal', pais: 'Guatemala' },
  'jalapa':           { lat: 14.6347, lng: -89.9890, label: 'Jalapa', pais: 'Guatemala' },
  'jutiapa':          { lat: 14.2917, lng: -89.8958, label: 'Jutiapa', pais: 'Guatemala' },
  'peten':            { lat: 16.9120, lng: -89.8925, label: 'Petén', pais: 'Guatemala' },
  'petén':            { lat: 16.9120, lng: -89.8925, label: 'Petén', pais: 'Guatemala' },
  'quetzaltenango':   { lat: 14.8347, lng: -91.5181, label: 'Quetzaltenango', pais: 'Guatemala' },
  'quiche':           { lat: 15.0300, lng: -91.1500, label: 'Quiché', pais: 'Guatemala' },
  'quiché':           { lat: 15.0300, lng: -91.1500, label: 'Quiché', pais: 'Guatemala' },
  'retalhuleu':       { lat: 14.5361, lng: -91.6778, label: 'Retalhuleu', pais: 'Guatemala' },
  'sacatepequez':     { lat: 14.5586, lng: -90.7339, label: 'Sacatepéquez', pais: 'Guatemala' },
  'sacatepéquez':     { lat: 14.5586, lng: -90.7339, label: 'Sacatepéquez', pais: 'Guatemala' },
  'san marcos':       { lat: 14.9639, lng: -91.7944, label: 'San Marcos', pais: 'Guatemala' },
  'santa rosa':       { lat: 14.2761, lng: -90.2989, label: 'Santa Rosa', pais: 'Guatemala' },
  'solola':           { lat: 14.7727, lng: -91.1830, label: 'Sololá', pais: 'Guatemala' },
  'sololá':           { lat: 14.7727, lng: -91.1830, label: 'Sololá', pais: 'Guatemala' },
  'suchitepequez':    { lat: 14.5342, lng: -91.5033, label: 'Suchitepéquez', pais: 'Guatemala' },
  'suchitepéquez':    { lat: 14.5342, lng: -91.5033, label: 'Suchitepéquez', pais: 'Guatemala' },
  'totonicapan':      { lat: 14.9117, lng: -91.3611, label: 'Totonicapán', pais: 'Guatemala' },
  'totonicapán':      { lat: 14.9117, lng: -91.3611, label: 'Totonicapán', pais: 'Guatemala' },
  'zacapa':           { lat: 14.9722, lng: -89.5306, label: 'Zacapa', pais: 'Guatemala' },

  'mexico':           { lat: 19.4326, lng: -99.1332, label: 'México', pais: 'México' },
  'méxico':           { lat: 19.4326, lng: -99.1332, label: 'México', pais: 'México' },
  'panama':           { lat: 8.9824, lng: -79.5199, label: 'Panamá', pais: 'Panamá' },
  'panamá':           { lat: 8.9824, lng: -79.5199, label: 'Panamá', pais: 'Panamá' },
  'honduras':         { lat: 14.0723, lng: -87.1921, label: 'Honduras', pais: 'Honduras' },
  'el salvador':      { lat: 13.6929, lng: -89.2182, label: 'El Salvador', pais: 'El Salvador' },
  'costa rica':       { lat: 9.9281, lng: -84.0907, label: 'Costa Rica', pais: 'Costa Rica' },
  'nicaragua':        { lat: 12.1140, lng: -86.2362, label: 'Nicaragua', pais: 'Nicaragua' },
  'colombia':         { lat: 4.7110, lng: -74.0721, label: 'Colombia', pais: 'Colombia' },
  'ecuador':          { lat: -0.1807, lng: -78.4678, label: 'Ecuador', pais: 'Ecuador' },
  'peru':             { lat: -12.0464, lng: -77.0428, label: 'Perú', pais: 'Perú' },
  'perú':             { lat: -12.0464, lng: -77.0428, label: 'Perú', pais: 'Perú' },
  'usa':              { lat: 38.9072, lng: -77.0369, label: 'Estados Unidos', pais: 'Estados Unidos' },
  'united states':    { lat: 38.9072, lng: -77.0369, label: 'Estados Unidos', pais: 'Estados Unidos' },
  'estados unidos':   { lat: 38.9072, lng: -77.0369, label: 'Estados Unidos', pais: 'Estados Unidos' }
};

// ======================================================
// ENTRADA DEL ROUTER PRINCIPAL
// ======================================================

function handleOGAAction(action, params, session) {
  try {
    // La página OGA NO es un panel administrativo. El usuario activo de OGA
    // puede consultar sus indicadores; otros departamentos no tienen acceso.
    if (!session || !session.valid || !session.user) {
      return {success:false,message:'Sesión OGA inválida. Inicie sesión de nuevo.'};
    }
    var dept = normalizeDepartmentKey_(session.user.department);
    if (!isAdministratorRole_(session.user.role) && dept !== 'OGA') {
      return {success:false,message:'Este usuario no pertenece al departamento OGA.'};
    }
    switch (action) {
      case 'OGA_GET_COMPILADO':
        return ogaGetCompilado(params, session);

      case 'OGA_GET_CLIENTES':
        return ogaGetClientes(params, session);

      case 'OGA_GET_SITIOS':
        return ogaGetSitios(params, session);

      case 'OGA_GET_CICLOS':
        return ogaGetCiclos(params, session);

      case 'OGA_GET_EVENTOS':
        return ogaGetEventos(params, session);

      case 'OGA_GET_TABLERO':
        return ogaGetTablero(session);

      case 'OGA_GET_DASHBOARD':
        return ogaGetDashboard(params, session);

      default:
        return { success: false, message: 'Acción OGA no reconocida: ' + action };
    }
  } catch (e) {
    Logger.log('[handleOGAAction][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// HELPERS
// ======================================================

function ogaGetSS_() {
  return SpreadsheetApp.openById(pncalSpreadsheetId_('OGA'));
}

function ogaSheetData_(sheetName) {
  try {
    var ss = ogaGetSS_();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { headers: [], rows: [] };

    var values = sh.getDataRange().getValues();
    if (!values || !values.length) return { headers: [], rows: [] };

    return {
      headers: values[0] || [],
      rows: values.length > 1 ? values.slice(1) : []
    };
  } catch (e) {
    Logger.log('[ogaSheetData_][' + sheetName + '] ' + e.message);
    return { headers: [], rows: [] };
  }
}

function ogaClean_(v) {
  return String(v == null ? '' : v).trim();
}

function ogaNum_(v) {
  var n = Number(v || 0);
  return isNaN(n) ? 0 : n;
}

function ogaLower_(v) {
  return ogaClean_(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function ogaDateText_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return ogaClean_(v);
}

function ogaNormalizeEstado_(estado) {
  var e = ogaLower_(estado);

  if (!e) return 'Sin estado';
  if (e.indexOf('vigente') >= 0 || e.indexOf('activo') >= 0 || e === 'acreditado') return 'Vigente';
  if (e.indexOf('proceso') >= 0 || e.indexOf('tramite') >= 0 || e.indexOf('trámite') >= 0) return 'En proceso';
  if (e.indexOf('cancel') >= 0) return 'Cancelado';
  if (e.indexOf('suspend') >= 0) return 'Suspendido';
  if (e.indexOf('cerrado') >= 0) return 'Cerrado';
  if (e.indexOf('abierto') >= 0) return 'Abierto';

  return ogaClean_(estado);
}

function ogaClasificarSegmento_(tipo, norma, razon, estado) {
  var blob = ogaLower_([tipo, norma, razon, estado].join(' '));

  // Todo lo que contenga "reconocido" se separa de los acreditados.
  if (blob.indexOf('reconocid') >= 0 || blob.indexOf('reconocimiento') >= 0) {
    return OGA_SEGMENTOS.RECONOCIDOS;
  }

  return OGA_SEGMENTOS.ACREDITADOS;
}

function ogaBump_(obj, key, amount) {
  key = key || 'Sin dato';
  obj[key] = (obj[key] || 0) + (amount == null ? 1 : amount);
}

function ogaEnsureSeg_(obj, segmento) {
  if (!obj[segmento]) obj[segmento] = {};
  return obj[segmento];
}

function ogaBuildStatsClientes_(clientes) {
  var stats = {
    total: clientes.length,
    bySegmento: {},
    byEstado: {},
    byTipo: {},
    byNorma: {},
    byEstadoSegmento: {},
    byTipoSegmento: {},
    byNormaSegmento: {},
    proyecciones: {}
  };

  clientes.forEach(function(c) {
    ogaBump_(stats.bySegmento, c.segmento);
    ogaBump_(stats.byEstado, c.estado);
    ogaBump_(stats.byTipo, c.tipo);
    ogaBump_(stats.byNorma, c.norma);

    ogaBump_(ogaEnsureSeg_(stats.byEstadoSegmento, c.segmento), c.estado);
    ogaBump_(ogaEnsureSeg_(stats.byTipoSegmento, c.segmento), c.tipo);
    ogaBump_(ogaEnsureSeg_(stats.byNormaSegmento, c.segmento), c.norma);
  });

  stats.kpisSegmentados = {};

  Object.keys(stats.bySegmento).forEach(function(seg) {
    var universo = stats.bySegmento[seg] || 0;
    var est = stats.byEstadoSegmento[seg] || {};
    var vig = est['Vigente'] || 0;
    var proc = est['En proceso'] || 0;
    var susp = est['Suspendido'] || 0;
    var canc = est['Cancelado'] || 0;

    /*
     * REGLA DE NEGOCIO OGA:
     * El total operativo de "Acreditados" o "Reconocidos"
     * solo cuenta registros VIGENTES.
     * En proceso, suspendidos y cancelados quedan como seguimiento,
     * pero no se suman al total acreditado/reconocido.
     */
    stats.kpisSegmentados[seg] = {
      total: vig,
      vigentes: vig,
      enProceso: proc,
      suspendidos: susp,
      cancelados: canc,
      universo: universo
    };

    stats.proyecciones[seg] = {
      total: vig,
      universo: universo,
      vigentes: vig,
      enProceso: proc,
      suspendidos: susp,
      cancelados: canc,
      indiceVigencia: universo ? Math.round((vig / universo) * 10000) / 100 : 0,
      indiceRiesgo: universo ? Math.round(((susp + canc) / universo) * 10000) / 100 : 0,
      potencialCrecimiento: universo ? Math.round((proc / universo) * 10000) / 100 : 0
    };
  });

  return stats;
}

function ogaBuildClienteLookup_(clientes) {
  var map = {};
  clientes.forEach(function(c) {
    if (c.oecId) map[c.oecId] = c;
  });
  return map;
}

function ogaDetectGeo_(direccion, ciudad, depto, paisLibre) {
  var rawPais = ogaClean_(paisLibre);
  var texto = ogaLower_([direccion, ciudad, depto, paisLibre].join(' '));
  var deptoLow = ogaLower_(depto);
  var ciudadLow = ogaLower_(ciudad);
  var paisLow = ogaLower_(paisLibre);

  var key = '';

  if (paisLow && OGA_COORDS[paisLow]) key = paisLow;

  if (!key && deptoLow && OGA_COORDS[deptoLow]) key = deptoLow;
  if (!key && ciudadLow && OGA_COORDS[ciudadLow]) key = ciudadLow;

  if (!key) {
    var keys = Object.keys(OGA_COORDS);
    for (var i = 0; i < keys.length; i++) {
      if (texto.indexOf(keys[i]) >= 0) {
        key = keys[i];
        break;
      }
    }
  }

  if (!key) key = 'guatemala capital';

  var coord = OGA_COORDS[key] || OGA_COORDS['guatemala capital'];
  var pais = rawPais || coord.pais || 'Guatemala';

  var region = 'Otros países';
  if (pais === 'Guatemala') {
    region = (coord.label === 'Guatemala') ? 'Guatemala capital' : 'Departamentos';
  }

  return {
    pais: pais,
    region: region,
    label: coord.label,
    lat: coord.lat,
    lng: coord.lng,
    precision: key === 'guatemala capital' && texto.indexOf('guatemala') < 0 ? 'aproximada' : 'detectada'
  };
}

// ======================================================
// CLIENTES / DIRECTORIO
// Hoja Clientes esperada:
// A ID OEC, B Razón, C Tipo, D Norma, F Contacto, G Email,
// H Estado, I Link ficha, L Acreditado desde, M Última evaluación
// ======================================================

function ogaReadClientes_() {
  var d = ogaSheetData_(OGA_SHEETS.CLIENTES);
  var clientes = [];

  d.rows.forEach(function(row) {
    var oecId = ogaClean_(row[0]);
    if (!oecId) return;

    var razon = ogaClean_(row[1]);
    var tipo = ogaClean_(row[2]);
    var norma = ogaClean_(row[3]);
    var contacto = ogaClean_(row[5]);
    var email = ogaClean_(row[6]);
    var estado = ogaNormalizeEstado_(row[7]);
    var linkFicha = ogaClean_(row[8]);
    var acredDesde = ogaDateText_(row[11]);
    var ultimaEval = ogaDateText_(row[12]);
    var segmento = ogaClasificarSegmento_(tipo, norma, razon, estado);

    clientes.push({
      oecId: oecId,
      razon: razon,
      tipo: tipo || 'Sin tipo',
      norma: norma || 'Sin norma',
      contacto: contacto,
      email: email,
      estado: estado,
      segmento: segmento,
      acredDesde: acredDesde,
      ultimaEval: ultimaEval,
      linkFicha: linkFicha
    });
  });

  return clientes;
}

function ogaGetClientes(params, session) {
  try {
    params = params || {};

    var filtroSegmento = ogaClean_(params.segmento);
    var filtroEstado = ogaClean_(params.estado);
    var filtroTipo = ogaClean_(params.tipo);
    var filtroNorma = ogaClean_(params.norma);
    var filtroTexto = ogaLower_(params.texto);
    var limite = Math.min(ogaNum_(params.limite || 1000), 2000);

    var all = ogaReadClientes_();
    var stats = ogaBuildStatsClientes_(all);

    var filtered = all.filter(function(c) {
      if (filtroSegmento && c.segmento !== filtroSegmento) return false;
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (filtroTipo && c.tipo !== filtroTipo) return false;
      if (filtroNorma && c.norma !== filtroNorma) return false;

      if (filtroTexto) {
        var blob = ogaLower_([
          c.oecId, c.razon, c.tipo, c.norma, c.estado,
          c.segmento, c.contacto, c.email
        ].join(' '));
        if (blob.indexOf(filtroTexto) < 0) return false;
      }

      return true;
    });

    return {
      success: true,
      total: all.length,
      filtered: filtered.length,
      clientes: filtered.slice(0, limite),
      stats: stats,
      catalogos: {
        estados: Object.keys(stats.byEstado).sort(),
        tipos: Object.keys(stats.byTipo).sort(),
        normas: Object.keys(stats.byNorma).sort(),
        segmentos: [OGA_SEGMENTOS.ACREDITADOS, OGA_SEGMENTOS.RECONOCIDOS]
      }
    };

  } catch (e) {
    Logger.log('[ogaGetClientes][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// COMPILADO derivado desde Clientes para segmentación real
// ======================================================

function ogaGetCompilado(params, session) {
  try {
    var clientes = ogaReadClientes_();
    var stats = ogaBuildStatsClientes_(clientes);

    return {
      success: true,
      total: clientes.length,
      stats: stats,
      segmentos: {
        acreditados: {
          total: stats.bySegmento[OGA_SEGMENTOS.ACREDITADOS] || 0,
          byEstado: stats.byEstadoSegmento[OGA_SEGMENTOS.ACREDITADOS] || {},
          byTipo: stats.byTipoSegmento[OGA_SEGMENTOS.ACREDITADOS] || {},
          proyeccion: stats.proyecciones[OGA_SEGMENTOS.ACREDITADOS] || {}
        },
        reconocidos: {
          total: stats.bySegmento[OGA_SEGMENTOS.RECONOCIDOS] || 0,
          byEstado: stats.byEstadoSegmento[OGA_SEGMENTOS.RECONOCIDOS] || {},
          byTipo: stats.byTipoSegmento[OGA_SEGMENTOS.RECONOCIDOS] || {},
          proyeccion: stats.proyecciones[OGA_SEGMENTOS.RECONOCIDOS] || {}
        }
      }
    };

  } catch (e) {
    Logger.log('[ogaGetCompilado][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// SITIOS / UBICACIONES
// Hoja Sitios esperada:
// A ID OEC, C Nombre sitio, D Dirección, E Ciudad, F Depto/País,
// G Estado, I Fecha Alta
// El segmento se toma cruzando con Clientes por ID OEC.
// ======================================================

function ogaGetSitios(params, session) {
  try {
    params = params || {};

    var clientes = ogaReadClientes_();
    var lookup = ogaBuildClienteLookup_(clientes);
    var d = ogaSheetData_(OGA_SHEETS.SITIOS);

    var sitios = [];
    var markers = [];
    var stats = {
      total: 0,
      bySegmento: {},
      byPais: {},
      byRegion: {},
      byPaisSegmento: {},
      byRegionSegmento: {},
      byEstadoSegmento: {}
    };

    d.rows.forEach(function(row) {
      var oecId = ogaClean_(row[0]);
      if (!oecId) return;

      var cli = lookup[oecId] || {};
      var razon = cli.razon || '';
      var tipo = cli.tipo || '';
      var norma = cli.norma || '';

      var sitioNom = ogaClean_(row[2]) || razon || 'Sitio sin nombre';
      var direccion = ogaClean_(row[3]);
      var ciudad = ogaClean_(row[4]);
      var deptoPais = ogaClean_(row[5]);
      var estado = ogaNormalizeEstado_(row[6]);
      var fechaAlta = ogaDateText_(row[8]);

      var segmento = cli.segmento || ogaClasificarSegmento_(tipo, norma, razon, estado);
      var geo = ogaDetectGeo_(direccion, ciudad, deptoPais, '');

      var item = {
        oecId: oecId,
        razon: razon,
        tipo: tipo || 'Sin tipo',
        norma: norma || 'Sin norma',
        segmento: segmento,
        sitioNom: sitioNom,
        direccion: direccion,
        ciudad: ciudad,
        depto: deptoPais,
        pais: geo.pais,
        region: geo.region,
        geoLabel: geo.label,
        lat: geo.lat,
        lng: geo.lng,
        precision: geo.precision,
        estado: estado,
        fechaAlta: fechaAlta
      };

      sitios.push(item);

      markers.push({
        oecId: oecId,
        razon: razon,
        tipo: tipo || 'Sin tipo',
        segmento: segmento,
        sitioNom: sitioNom,
        direccion: direccion,
        ciudad: ciudad,
        depto: deptoPais,
        pais: geo.pais,
        region: geo.region,
        label: geo.label,
        lat: geo.lat,
        lng: geo.lng,
        estado: estado,
        precision: geo.precision
      });

      stats.total++;
      ogaBump_(stats.bySegmento, segmento);
      ogaBump_(stats.byPais, geo.pais);
      ogaBump_(stats.byRegion, geo.region);
      ogaBump_(ogaEnsureSeg_(stats.byPaisSegmento, segmento), geo.pais);
      ogaBump_(ogaEnsureSeg_(stats.byRegionSegmento, segmento), geo.region);
      ogaBump_(ogaEnsureSeg_(stats.byEstadoSegmento, segmento), estado);
    });

    return {
      success: true,
      total: sitios.length,
      sitios: sitios.slice(0, 1000),
      markers: markers.slice(0, 1000),
      markersAcreditados: markers.filter(function(m) { return m.segmento === OGA_SEGMENTOS.ACREDITADOS; }),
      markersReconocidos: markers.filter(function(m) { return m.segmento === OGA_SEGMENTOS.RECONOCIDOS; }),
      stats: stats
    };

  } catch (e) {
    Logger.log('[ogaGetSitios][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// TABLERO / DECISIONES DE CONSEJO
// Solo devuelve lo que se sigue usando: decisiones por tipo.
// ======================================================

function ogaGetTablero(session) {
  try {
    var d = ogaSheetData_(OGA_SHEETS.TABLERO);
    var data = [d.headers].concat(d.rows);

    var decisionesTipo = [];
    var kpis = {
      decisiones: {
        totalDecisiones: 0,
        actasRelacionadas: 0,
        registrosUnicos: 0,
        sinFechaVinculada: 0
      }
    };

    for (var r = 0; r < data.length; r++) {
      for (var c = 0; c < data[r].length; c++) {
        var cell = ogaClean_(data[r][c]);
        if (!cell) continue;

        if (cell === 'Total decisiones') {
          kpis.decisiones.totalDecisiones = ogaNum_(data[r + 1] ? data[r + 1][c] : 0);
        }

        if (cell === 'Actas relacionadas') {
          kpis.decisiones.actasRelacionadas = ogaNum_(data[r + 1] ? data[r + 1][c] : 0);
        }

        if (cell === 'Registros únicos') {
          kpis.decisiones.registrosUnicos = ogaNum_(data[r + 1] ? data[r + 1][c] : 0);
        }

        if (cell === 'Sin fecha vinculada') {
          kpis.decisiones.sinFechaVinculada = ogaNum_(data[r + 1] ? data[r + 1][c] : 0);
        }

        if (cell === 'Decisiones por tipo') {
          for (var j = r + 2; j < data.length; j++) {
            var tipo = ogaClean_(data[j][c]);
            if (!tipo || ogaLower_(tipo) === 'total') break;

            decisionesTipo.push({
              tipo: tipo,
              cantidad: ogaNum_(data[j][c + 1])
            });
          }
        }
      }
    }

    if (!kpis.decisiones.totalDecisiones && decisionesTipo.length) {
      kpis.decisiones.totalDecisiones = decisionesTipo.reduce(function(a, x) {
        return a + ogaNum_(x.cantidad);
      }, 0);
    }

    return {
      success: true,
      kpis: kpis,
      decisionesTipo: decisionesTipo
    };

  } catch (e) {
    Logger.log('[ogaGetTablero][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// CICLOS / SEGUIMIENTO
// Se mantiene por compatibilidad, aunque el HTML actual no lo explota.
// ======================================================

function ogaGetCiclos(params, session) {
  try {
    params = params || {};
    var d = ogaSheetData_(OGA_SHEETS.CICLOS);
    var clientes = ogaReadClientes_();
    var lookup = ogaBuildClienteLookup_(clientes);

    var ciclos = [];
    var stats = {
      bySegmento: {},
      byTipo: {},
      byEstado: {},
      seguimiento: {
        sg1: 0,
        sg2: 0,
        sg3: 0,
        reeval: 0
      }
    };

    d.rows.forEach(function(row) {
      var oecId = ogaClean_(row[0]);
      if (!oecId) return;

      var cli = lookup[oecId] || {};
      var razon = ogaClean_(row[1]) || cli.razon || '';
      var tipo = ogaClean_(row[2]) || cli.tipo || '';
      var norma = ogaClean_(row[3]) || cli.norma || '';
      var oficial = ogaClean_(row[4]);
      var estadoCiclo = ogaNormalizeEstado_(row[16]);
      var segmento = cli.segmento || ogaClasificarSegmento_(tipo, norma, razon, estadoCiclo);

      var sg1 = ogaClean_(row[11]);
      var sg2 = ogaClean_(row[12]);
      var sg3 = ogaClean_(row[13]);
      var reeval = ogaClean_(row[14]);

      if (sg1) stats.seguimiento.sg1++;
      if (sg2) stats.seguimiento.sg2++;
      if (sg3) stats.seguimiento.sg3++;
      if (reeval) stats.seguimiento.reeval++;

      ogaBump_(stats.bySegmento, segmento);
      ogaBump_(stats.byTipo, tipo || 'Sin tipo');
      ogaBump_(stats.byEstado, estadoCiclo || 'Sin estado');

      ciclos.push({
        oecId: oecId,
        razon: razon,
        tipo: tipo || 'Sin tipo',
        norma: norma || 'Sin norma',
        segmento: segmento,
        oficial: oficial,
        cicloDesde: ogaClean_(row[7]).replace('.0', ''),
        cicloHasta: ogaClean_(row[8]).replace('.0', ''),
        mesAncla: ogaClean_(row[9]).replace('.0', ''),
        sg1: sg1,
        sg2: sg2,
        sg3: sg3,
        reeval: reeval,
        cicloId: ogaClean_(row[15]),
        estadoCiclo: estadoCiclo,
        semaforo: ogaClean_(row[23])
      });
    });

    return {
      success: true,
      total: ciclos.length,
      ciclos: ciclos.slice(0, 1000),
      stats: stats
    };

  } catch (e) {
    Logger.log('[ogaGetCiclos][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// EVENTOS
// Se deja por compatibilidad con el router anterior.
// ======================================================

function ogaGetEventos(params, session) {
  try {
    params = params || {};
    var filtroAnio = ogaClean_(params.anio);
    var filtroMes = ogaClean_(params.mes);

    var d = ogaSheetData_(OGA_SHEETS.EVENTOS);
    var eventos = [];
    var stats = {
      byMes: {},
      byTipoEval: {},
      byEstado: {},
      byOficial: {}
    };

    d.rows.forEach(function(row) {
      var idEvento = ogaClean_(row[0]);
      if (!idEvento) return;

      var anio = ogaClean_(row[10]).replace('.0', '');
      var mesNom = ogaClean_(row[12]);

      if (filtroAnio && anio !== filtroAnio) return;
      if (filtroMes && mesNom !== filtroMes) return;

      var tipoEval = ogaClean_(row[8]);
      var estado = ogaNormalizeEstado_(row[13]);
      var oficial = ogaClean_(row[7]);

      eventos.push({
        idEvento: idEvento,
        oecId: ogaClean_(row[3]),
        razon: ogaClean_(row[4]),
        esquema: ogaClean_(row[5]),
        norma: ogaClean_(row[6]),
        oficial: oficial,
        tipoEval: tipoEval,
        tipoAct: ogaClean_(row[9]),
        anio: anio,
        mesNum: ogaClean_(row[11]).replace('.0', ''),
        mesNom: mesNom,
        estado: estado
      });

      ogaBump_(stats.byMes, mesNom);
      ogaBump_(stats.byTipoEval, tipoEval);
      ogaBump_(stats.byEstado, estado);
      ogaBump_(stats.byOficial, oficial);
    });

    return {
      success: true,
      total: eventos.length,
      eventos: eventos.slice(0, 1000),
      stats: stats
    };

  } catch (e) {
    Logger.log('[ogaGetEventos][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}

// ======================================================
// DASHBOARD GENERAL
// ======================================================

function ogaGetDashboard(params, session) {
  try {
    var clientes = ogaReadClientes_();
    var clientesStats = ogaBuildStatsClientes_(clientes);
    var tablero = ogaGetTablero(session);
    var sitios = ogaGetSitios({}, session);

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      clientesResumen: {
        total: clientes.length,
        stats: clientesStats
      },
      tablero: tablero.success ? tablero : { kpis: {}, decisionesTipo: [] },
      sitiosResumen: sitios.success ? sitios.stats : {},
      catalogos: {
        estados: Object.keys(clientesStats.byEstado).sort(),
        tipos: Object.keys(clientesStats.byTipo).sort(),
        normas: Object.keys(clientesStats.byNorma).sort(),
        segmentos: [OGA_SEGMENTOS.ACREDITADOS, OGA_SEGMENTOS.RECONOCIDOS]
      }
    };

  } catch (e) {
    Logger.log('[ogaGetDashboard][ERROR] ' + e.stack);
    return { success: false, message: e.message };
  }
}
