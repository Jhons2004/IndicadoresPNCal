# Indicadores PNCal / DSNC

Código fuente de la Web App de Google Apps Script de Indicadores PNCal. Incluye panel administrativo, CENAME, COGUANOR, CRETEC, OGA e inicio de sesión. Compatibilidad con las hojas institucionales existentes; la copia de las hojas de cálculo **no** se almacena en este repositorio.

## Iteración QA — octubre de 2026

- **PP-01:** Menú y paneles de COGUANOR y CRETEC, con indicadores desagregados y tablas legibles.
- **PP-02:** Resumen gráfico por unidad (OGA, CENAME, COGUANOR y CRETEC). OGA se obtiene de los KPI del módulo, sin inventar registros si no está disponible.
- **CE-01:** CENAME incorpora totales filtrados por año/mes de calibraciones, certificados, estaciones, dispensadores, verificaciones y huella; análisis por subcategoría/laboratorio y sector. Mangueras, vehículos y empresas beneficiadas se indican como **sin campo oficial identificado**, evitando equivalencias incorrectas.
- **OGA-01:** Modal hacia dashboard OGA con apertura externa de respaldo por restricciones de iframes de Google.
- **CENAME-01:** El botón de duplicados solo ejecuta diagnóstico; aplicación destructiva requiere propiedad explícita `CENAME_PERMITIR_DEPURACION=SI` y respaldo previo. Consultas administrativas pueden omitir bitácoras de carga y depuración para reducir tiempos.
- **CRETEC-01:** Entrada y salida de fecha civil `yyyy-MM-dd`, sin conversiones UTC de fechas de formulario. No se modifica masivamente el histórico: comparar fechas con actas antes de corregirlas.
- **Integridad del endpoint JSON CENAME:** Upsert por `idReporte` y `actualizado`; actualizaciones parciales preservan métricas omitidas del reporte previo. Reportes nuevos sin actividad cuantificable se ignoran con motivo explícito; no se insertan filas vacías.

> Las métricas fueron contrastadas estáticamente con la exportación `DSNC Indicadores PNCal.xlsx` del 15/10/2026. Las integraciones Apps Script/Sheets, autenticación, correos y despliegue requieren QA conectado. Nunca subir respaldos con datos personales a un repositorio público.

## Estructura

La raíz contiene directamente los archivos `*.js`, `*.html` y `appsscript.json` para desplegar con **clasp**. No se requieren compiladores Next.js o Node en Apps Script; CSS nativo responsivo en panel administrativo y Tailwind CDN mantenido en CRETEC para respetar estilos existentes.

## Preparar proyecto QA desde PowerShell

1. `git clone https://github.com/Jhons2004/IndicadoresPNCal.git`
2. `cd IndicadoresPNCal`
3. `npm.cmd install -g @google/clasp`
4. `clasp.cmd login` (usar cuenta institucional autorizada).
5. Crear una **copia QA del proyecto de Apps Script** desde el editor web. Copiar su **Script ID**, no URL de ejecución ni Deployment ID.
6. Vincular desde la raíz:

```powershell
@'
{
  "scriptId": "SCRIPT_ID_DEL_PROYECTO_QA",
  "rootDir": "."
}
'@ | Set-Content -Encoding utf8 .clasp.json
```

7. En **Configuración del proyecto → Propiedades de la secuencia de comandos** del proyecto QA, crear las propiedades indicadas a continuación, usando IDs de **copias QA** de las hojas de cálculo (no IDs productivos):

   | Propiedad | Valor |
   |---|---|
   | `PNCAL_QA_MODE` | `true` |
   | `PNCAL_SHEET_USUARIOS` | Script ID **de la hoja** de usuarios QA (Spreadsheet ID) |
   | `PNCAL_SHEET_INDICADORES` | Spreadsheet ID de indicadores/CENAME/COGUANOR/CRETEC QA |
   | `PNCAL_SHEET_OGA` | Spreadsheet ID de OGA QA |

   La propiedad `PNCAL_QA_MODE=true` evita usar silenciosamente los IDs productivos si falta alguna de las tres propiedades. Configure y conserve por separado `CENAME_API_KEY` de prueba. **La configuración se aplica al Script ID, no a GitHub.**

8. `clasp.cmd status` y `clasp.cmd push` **solo después de verificar que el ID es el QA**, no el de producción.
9. En Apps Script: `Implementar` → `Nueva implementación` → `Aplicación web`, otorgar los accesos correctos según política institucional y autorizar servicios Gmail/Drive/Sheets.

**Advertencia:** una copia de Apps Script no necesariamente copia archivos de Google Sheets ni propiedades de script, permisos, activadores o despliegues. Probar primero con datos QA en una copia autorizada de las hojas y configurar las propiedades necesarias (`CENAME_API_KEY` para endpoint externo, etc.). Nunca publicar claves en GitHub.

## Validaciones

```powershell
node --check .\Code.js
node --check .\CENAME_Excel.js
node --check .\OGA_modulo.js
clasp.cmd status
```

Revisar manualmente creación, edición, login por rol, filtros de período, informes OGA, importación CENAME con mismo `idReporte`, logs y fechas CRETEC. Para producción, crear respaldo de Apps Script y Sheets y desplegar una nueva **versión** solo tras revisión institucional.

## Revisión del 15/10/2026: OGA y clasificación CENAME

**OGA:** los usuarios `Usuario` o `Jefe` del departamento OGA son dirigidos a `?page=OGA` (no al área administrativa). El módulo hace peticiones internas `google.script.run` con sesión verificada. El acceso a operaciones de OGA se comprueba en el backend; otras unidades no tienen ese permiso. Los administradores conservan acceso a su panel global.

**CENAME:** el Excel de auditoría tiene 476 filas de `CENAME_REGISTROS`, repartidas en 232 dispensadores, 42 preempacados y 202 instrumentos calibrados. El total de 397 filas en `CENAME_CARGAS` representa intentos de carga (incluye errores, reintentos y actualizaciones), **no** 397 nuevas operaciones. En el historial se separan insertados, actualizados, ignorados, duplicados y errores. Los envíos `SIN_DATOS` sin tipo válido aparecen en el nuevo diagnóstico con motivo, sin atribuirlos a dispensadores.

La hoja **`CENAME_RESUMEN_MENSUAL`** es una vista materializada que se reconstruye a partir de `CENAME_REGISTROS`. Cada fila se agrupa por **año + mes de fecha de operación + entorno** y contiene sumas como calibraciones, certificados y huella. No registra nuevas actividades, no debe sumarse por separado a los originales y nunca es fuente para crear más filas en `CENAME_REGISTROS`.

**Actividad vacía:** los envíos JSON sin un `idReporte` válido o sin actividad cuantificable no generan un registro ficticio. Las causas quedan en `CENAME_DEBUG` y, para cargas nuevas, también en `CENAME_CARGAS.Detalle`. Si existe una versión válida anterior del reporte, la lógica de upsert existente continúa preservando campos omitidos de actualizaciones parciales. Una transmisión con actividad cero no demuestra nuevas inspecciones.

**Rendimiento:** abrir CENAME ya no ejecuta la inicialización migratoria y reconstrucción global en cada ingreso, ni consulta el diagnóstico adicional en cada refresh. Las consultas leen los registros existentes. Las migraciones de datos deben ejecutarse explícitamente bajo control del administrador.

**Comprobación sin modificaciones en producción:** comparación estática y pruebas de funciones puras contra la exportación del 15/10/2026: 476 registros reconocidos, 23 grupos mensuales, 1,315 calibraciones, 187 certificados, 190 estaciones y 1,711 dispensadores. Estas pruebas no verifican aún el despliegue `/exec`, permisos Workspace ni acceso a Sheets en vivo.

## Iteración visual OGA y navegación adaptable (15/10/2026)

- La opción **OGA** del panel administrativo carga exclusivamente el dashboard institucional OGA en un `iframe` adaptable; se eliminó la tabla redundante de organismos de esa vista.
- URL de origen: `https://script.google.com/a/macros/oga.org.gt/s/AKfycbyoFIvjS5NW6fDbDhnhZMdeIpnmEzVQsWxJfcD6A_pC-WuAG_MnNt6eGlZeZc-EphC8/exec`.
- **Advertencia técnica:** si la aplicación OGA de origen envía restricciones de `X-Frame-Options` o CSP, el navegador impedirá el iframe. Eso no se puede resolver desde Indicadores PNCal: el administrador del despliegue de origen OGA debe autorizar su incrustación (por ejemplo, `HtmlService.XFrameOptionsMode.ALLOWALL` en el `doGet`, tras evaluar seguridad y autenticar el acceso). El botón **Abrir en otra pestaña** ofrece alternativa.
- El menú lateral se ajusta en escritorio y se convierte en menú de hamburguesa con fondo superpuesto en pantallas medianas/pequeñas.
- La esquina superior derecha abre un menú de usuario con **Cerrar sesión** que utiliza la función ya existente `cerrarSesionSeguro()`. El cierre de sesión lateral sigue disponible.
- Esta iteración modifica **solo** `administrativo.html` y esta documentación: no cambia endpoints, hojas de cálculo, contraseñas, autorizaciones ni la lógica de indicadores.
- Publicación: `git pull origin main`, verificar `.clasp.json` y `clasp.cmd push`; luego **Implementar > Administrar implementaciones > Editar > Nueva versión** para mantener la URL actual.

## Iteración 16/10/2026 — Filtros mensuales CRETEC y COGUANOR

- El panel administrativo presenta los mismos controles **Año / Mes / Actualizar** que CENAME para CRETEC y COGUANOR. El año inicial es el actual y el mes inicial es «Todos los meses».
- La consulta `GET_INDICATOR_DATA` aplica los filtros en `readIndicatorSheet_` **antes** de devolver datos o calcular `totalRows`, por lo que tarjetas, gráficas y tabla reflejan el período elegido. Se normalizan meses numéricos y nombres en español (incluyendo «setiembre»).
- La hoja `CRETEC` usa la **columna Mes** (B) para clasificar el mes declarado y la **Fecha Exacta** (C) para determinar el año. La hoja `COGUANOR` usa la **columna Mes** (B) y el año del **Timestamp** (A). No se reescriben ni corrigen fechas históricas.
- `metrics` contiene las sumas y agrupaciones para **todas** las filas filtradas, aun si se limita la cantidad de filas enviadas a la tabla por rendimiento. Si no hay filas, se muestran cero y un estado vacío claro.
- Los botones «Solicitar actualización» abren el módulo existente **Correos**, seleccionan la unidad, recuperan destinatarios configurados mediante `GET_DEPARTMENT_EMAILS` y preparan un mensaje con los enlaces institucionales. **No se envía ningún correo automáticamente**; el administrador puede revisar destinatarios y mensaje y debe confirmar el envío mediante `SEND_REMINDER_EMAIL`.
- URL facilitada por DSNC para panel administrativo (requiere rol Administrador): `https://script.google.com/a/dsnc.gob.gt/macros/s/AKfycbxUQIpLAxNM8tk7TkqoJDPLQJIlCyvvUDlSF5Ed1fo-MPioimYr3Ws01RqXtJiDMiKI/exec?page=administrativo`. El correo también utiliza `?page=login` para que usuarios de CRETEC o COGUANOR puedan entrar con sus credenciales y ser dirigidos al módulo correspondiente.
- El backend incluye un botón HTML para abrir el portal cuando el correo corresponde a una solicitud de indicadores. La operación exige permisos administrativos existentes; se usa el mismo módulo de correo institucional y no se modifican las hojas de datos.

**Despliegue:** tras revisar `git status`, `git pull origin main`, `clasp.cmd status` y `clasp.cmd push`, editar **la implementación actual** de Apps Script y elegir **Nueva versión**. `clasp push` por sí solo no cambia el despliegue `/exec` versionado.

**Pendiente de QA conectado:** verificar destinatarios reales configurados, entrega de MailApp en dominio DSNC y accesos de cada rol desde el nuevo mensaje. Las pruebas locales no enviaron correos.


## Cierre de sesión CENAME · 16/10/2026

Se reemplazó la pantalla genérica «Cerrando sesión / Redirigiendo» por un modal de progreso exclusivo de CENAME con foco accesible, indicador de carga, bloqueo del contenido mientras se elimina la sesión local y salida automática al login. Si el navegador bloquea una navegación dentro de Google Apps Script, transcurridos unos segundos se muestra un enlace manual al login en el mismo modal. No se cambian datos ni endpoints del sistema.
