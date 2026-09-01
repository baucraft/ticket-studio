import "./index.css"
import App from "./App.tsx"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

async function bootstrap() {
  const loaderUrl = `${import.meta.env.BASE_URL}vendor/sheetjs-loader.mjs`
  await import(/* @vite-ignore */ loaderUrl)

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
