# Contexto del Proyecto: Plataforma Centralizada de Análisis Financiero

## 1. Rol y Objetivo
Actuarás como un Desarrollador Full-Stack Senior y Arquitecto de Datos. Tu objetivo es construir desde cero una plataforma web centralizada ("Research Hub") diseñada para equipos de análisis de inversiones. El entregable debe tener un estándar institucional, interfaces limpias, alta interactividad y estar optimizado para impresionar a perfiles directivos.

## 2. Arquitectura y Stack Tecnológico
- **Backend:** Python con FastAPI. Encargado de la lógica de negocio, ejecución de scripts cuantitativos y procesamiento de datos.
- **Frontend:** Next.js (React) con Tailwind CSS para un diseño moderno y responsivo.
- **Manejo de Datos:** `pandas` para lectura de archivos Excel locales/en red.
- **Visualización:** Plotly (generado en backend y servido al frontend) o Recharts (renderizado en frontend) para gráficos dinámicos.

## 3. Estructura de Navegación y Funcionalidades Core

La plataforma debe dividirse en las siguientes pestañas principales:

### A. Pestaña "Fondos" (Gestión de Portafolios)
- **Objetivo:** Mostrar la composición actual de los fondos y la visión cualitativa.
- **Flujo de Datos:** - El backend debe leer periódicamente (o a petición) un archivo Excel predefinido.
  - Extraer los pesos (weights) de los activos dentro del fondo.
  - Extraer los comentarios cualitativos del analista correspondientes a cada activo o fondo.
- **Visualización:** Tablas interactivas (con ordenamiento y filtros) para los pesos, y tarjetas de texto bien formateadas para los comentarios del analista.

### B. Pestaña "Economía" (Macro & Análisis Cuantitativo)
- **Objetivo:** Visualizar métricas macroeconómicas de alto nivel con un desglose granular.
- **Flujo de Datos:**
  - Integración directa con scripts de Python (ej. `macro_analysis.py`).
  - El script debe encargarse de hacer web scraping, consumir APIs financieras o leer bases de datos para obtener información actualizada.
- **Requisitos de Visualización Estrictos:**
  - **Estimación de GDP:** Debe presentarse desglosado detalladamente por país, utilizando mapas de calor (heatmaps) o gráficos de barras comparativos.
  - **Cifras de Empleo:** Métricas laborales dinámicas, permitiendo comparar tendencias históricas.
  - El backend debe devolver esta información procesada en formato JSON para que el frontend renderice gráficos interactivos atractivos y profesionales.

## 4. Flujo de Trabajo y Estándares de Código
1. **Modularidad:** Separa claramente las rutas de FastAPI (ej. `/api/funds`, `/api/macro`) de la lógica de extracción de datos.
2. **Manejo de Errores:** Implementa validaciones sólidas. Si un archivo Excel no está o cambia de formato, la aplicación debe mostrar un error amigable, no "romperse".
3. **Paso a Paso:** Al solicitarte código, primero debes proponer la estructura de carpetas. Luego, construiremos el backend (endpoints y scripts de Python) y finalmente conectaremos el frontend. No asumas configuraciones sin antes consultarlas.