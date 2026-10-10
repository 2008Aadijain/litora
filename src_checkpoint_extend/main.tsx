import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./components";
import { SellerCustomizationProvider } from "./seller-customization";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SellerCustomizationProvider>
          <App />
        </SellerCustomizationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
