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
