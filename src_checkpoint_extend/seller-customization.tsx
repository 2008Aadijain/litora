import { createContext, useContext, useState, type ReactNode } from "react";

export type SellerCustomization = {
  logoUrl: string | null;
  backgroundColor: string | null;
  accentColor: string | null;
};

type Ctx = {
  customization: SellerCustomization | null;
  setCustomization: (c: SellerCustomization | null) => void;
};

const SellerCustomizationContext = createContext<Ctx>({
  customization: null,
  setCustomization: () => {},
});

export function SellerCustomizationProvider({ children }: { children: ReactNode }) {
  const [customization, setCustomization] = useState<SellerCustomization | null>(null);
  return (
    <SellerCustomizationContext.Provider value={{ customization, setCustomization }}>
      {children}
    </SellerCustomizationContext.Provider>
  );
}

export function useSellerCustomization() {
  return useContext(SellerCustomizationContext);
}
