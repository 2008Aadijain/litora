import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  type?: string;
  jsonLd?: object | object[];
}

const SITE_URL = "https://ebook-marketplace-mv-5l6o.bolt.host";
const DEFAULT_IMG = `${SITE_URL}/og-image.svg`;

const ORGANIZATION_LD: object = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Litora",
  description: "Litora is a bookstore marketplace connecting independent authors with bookstores worldwide. Buy and sell independent author ebooks through Litora QR storefronts, bridging physical to digital book sales.",
  url: SITE_URL,
  logo: `${SITE_URL}/og-image.svg`,
};

export function useSEO({ title, description, path, image, type, jsonLd }: SEOOptions) {
  useEffect(() => {
    const fullTitle = title;
    const url = path ? `${SITE_URL}${path}` : SITE_URL;
    const img = image || DEFAULT_IMG;
    const desc = description || "Litora is a bookstore marketplace for independent author ebooks. Buy and sell ebooks, set up your Litora QR storefront, and grow your indie bookstore revenue.";

    document.title = fullTitle;

    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("description", desc);
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", desc, "property");
    setMeta("og:url", url, "property");
    setMeta("og:type", type || "website", "property");
    setMeta("og:image", img, "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", desc);
    setMeta("twitter:image", img);

    // Canonical tag
    let canonEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonEl) {
      canonEl = document.createElement("link");
      canonEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonEl);
    }
    canonEl.setAttribute("href", url);

    // JSON-LD: always include Organization, plus any page-specific schema
    let ldEl = document.getElementById("jsonld-dynamic") as HTMLScriptElement | null;
    if (!ldEl) {
      ldEl = document.createElement("script");
      ldEl.id = "jsonld-dynamic";
      ldEl.setAttribute("type", "application/ld+json");
      document.head.appendChild(ldEl);
    }
    const pageLd = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
    ldEl.textContent = JSON.stringify([ORGANIZATION_LD, ...pageLd]);
  }, [title, description, path, image, type, jsonLd]);
}
