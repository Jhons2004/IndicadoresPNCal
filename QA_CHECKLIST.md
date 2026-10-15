# Plan de pruebas de aceptación PNCal

- [ ] Activar `PNCAL_QA_MODE=true` y configurar los tres Spreadsheet IDs QA antes de probar cualquier edición.
- [ ] `TEST_CONNECTION` y `AUTH_CHECK` funcionan con usuarios activos de cada departamento.
- [ ] Usuarios OGA/CRETEC no son expulsados indebidamente a login; usuarios no administradores no pueden usar acciones `GET_USERS`.
- [ ] El panel global enumera cuatro unidades y no mezcla encabezados distintos.
- [ ] COGUANOR: no cuenta filas sin `Tipo Registro` válido; normas adoptadas/distribuidas y consultas se reportan por separado.
- [ ] CRETEC: los registros 18/06, 24/06, 30/07 y 27/08 se contrastan con acta y no cambian al editar/guardar.
- [ ] CENAME por mes y año coincide con `CENAME_RESUMEN_MENSUAL` para calibraciones, certificados, estaciones, dispensadores y huella.
- [ ] Laboratorios CENAME se agrupan por `Subcategoria` en instrumentos calibrados, no por departamento operativo.
- [ ] Reportar ausencia de campos explícitos para mangueras, vehículos y empresas; no inflar cifras.
- [ ] El diagnóstico de duplicados no modifica la hoja, no elimina registros y responde dentro del tiempo de ejecución.
- [ ] Endpoint CENAME: un `idReporte` actualizado preserva contadores omitidos, un `0` explícito los reemplaza, `actualizado` antiguo se ignora y un mismo `idReporte` no se duplica.
- [ ] Endpoint CENAME: reportes nuevos con solo metadatos no generan filas de indicadores.
- [ ] Modal externo OGA abre dashboard institucional; si Google bloquea iframe, enlace de nueva pestaña funciona.
- [ ] Se comprueba paginación visual (máximo 200 filas visibles) y desplazamiento horizontal en móvil.
- [ ] No se subió `.clasp.json`, cuentas ni datos XLSX privados al repositorio.

## Pendientes de definición institucional

- Nombre oficial del laboratorio para códigos MA, TE, HRTE y demás subcategorías.
- Definiciones inequívocas y campos origen: vehículos atendidos, mangueras inspeccionadas, empresas beneficiadas y gasolineras únicas.
- Resolver discrepancias históricas de fechas CRETEC antes de ejecutar migración.

### CENAME / OGA — verificación posterior al despliegue (15/10/2026)

- [ ] Login con usuario OGA activo y rol `Usuario` redirige a `?page=OGA`; no muestra panel de administración.
- [ ] `OGA_GET_DASHBOARD` y `OGA_GET_CLIENTES` cargan cifras con `google.script.run` y sesión válida.
- [ ] Usuarios CENAME y CRETEC no pueden consultar los endpoints OGA.
- [ ] Entrar a CENAME ya no ejecuta una migración de datos automáticamente.
- [ ] Seleccionar cada entorno muestra los registros esperados (histórico de prueba: 232, 42 y 202).
- [ ] Las tarjetas específicas de cada entorno y el resumen mensual concuerdan con `CENAME_REGISTROS`.
- [ ] La pantalla «Intentos JSON no clasificados» indica motivos sin mostrar un registro operativo artificial.
- [ ] Las cargas JSON nuevas informan `Detalle` con causa del primer error de normalización.
- [ ] Las actualizaciones con el mismo `idReporte` no insertan una segunda operación.
- [ ] Corregir un registro modifica el total del resumen del mes operativo correcto.
- [ ] Verificar permisos de hojas, propiedades del script y aplicación web versionada antes de declarar producción estable.

### Vista OGA embebida / navegación adaptable
- [ ] OGA no muestra listado de organismos, solamente el dashboard externo embebido.
- [ ] El enlace externo abre el dashboard si Google bloquea el iframe por política del origen.
- [ ] En móvil (390 px) la navegación lateral se abre, se cierra y no genera desbordamiento horizontal.
- [ ] En escritorio el menú del usuario despliega **Cerrar sesión** y el botón lateral sigue disponible.
- [ ] Cerrar sesión desde cualquiera de los dos controles vuelve al login.
- [ ] Los demás módulos (CENAME, COGUANOR, CRETEC, usuarios y correo) funcionan igual que antes.
