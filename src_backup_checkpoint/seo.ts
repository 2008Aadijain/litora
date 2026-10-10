import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  type?: string;
  jsonLd?: object;
}

const SITE_URL = "https://ebook-marketplace-mv-5l6o.bolt.host";
const DEFAULT_IMG = `${SITE_URL}/og-image.svg`;

export function useSEO({ title, description, path, image, type, jsonLd }: SEOOptions) {
  useEffect(() => {
    const fullTitle = title.includes("Litora") ? title : `${title} - Litora`;
    const url = path ? `${SITE_URL}${path}` : SITE_URL;
    const img = image || DEFAULT_IMG;
    const desc = description || "Litora is a curated book marketplace featuring premium titles from independent authors.";

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

    let ldEl = document.getElementById("jsonld-dynamic") as HTMLScriptElement | null;
    if (jsonLd) {
      if (!ldEl) {
        ldEl = document.createElement("script");
        ldEl.id = "jsonld-dynamic";
        ldEl.setAttribute("type", "application/ld+json");
        document.head.appendChild(ldEl);
      }
      ldEl.textContent = JSON.stringify(jsonLd);
    } else if (ldEl) {
      ldEl.remove();
    }
  }, [title, description, path, image, type, jsonLd]);
}
