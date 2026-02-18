# LaLocal Chat (MVP)

Frontend web tipo ChatGPT para gestionar locaciones (Crear / Actualizar / Consultar).

## Configuración
Crea un `.env.local` (o variables en Vercel) con:

```bash
API_BASE_URL="https://lalocal-lalocal.bmuoio.easypanel.host"
```

> Nota: `API_BASE_URL` es **server-side**. El navegador solo habla con `/api/*` (proxy) para evitar problemas de CORS.

## Desarrollo

```bash
npm install
npm run dev
```

Abre: http://localhost:3000

## Autenticación (MVP)
En la primera pantalla pegas tu `token` (por usuario). Se guarda en `localStorage`.

## Endpoints esperados en el backend (EasyPanel)
Este frontend llama (vía proxy) a:
- `POST /lalocal/v1/chat/message`
- `POST /lalocal/v1/chat/upload` (multipart, `files[]`)

Estos endpoints se implementarán dentro de `lalocal-webhook`.
