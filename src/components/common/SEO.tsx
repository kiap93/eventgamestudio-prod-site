import React, { useEffect } from 'react';
import {
  SITE_DOMAIN,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  PageSeoConfig,
  getBreadcrumbSchema,
  getFaqPageSchema,
} from '../../lib/seo';

export interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  twitterCard?: 'summary_large_image' | 'summary';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
  breadcrumbs?: Array<{ name: string; item: string }>;
  faqs?: Array<{ question: string; answer: string }>;
  config?: PageSeoConfig;
}

function updateMetaTag(attrName: 'name' | 'property', attrValue: string, content: string | undefined): void {
  if (typeof document === 'undefined') return;
  let element = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!content) {
    if (element) element.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function updateCanonicalLink(url: string | undefined): void {
  if (typeof document === 'undefined') return;
  let element = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!url) {
    if (element) element.remove();
    return;
  }
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', url);
}

function updateJsonLd(schemas: Array<Record<string, any>>): void {
  if (typeof document === 'undefined') return;
  const scriptId = 'egs-seo-jsonld';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!schemas || schemas.length === 0) {
    if (script) script.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schemas.length === 1 ? schemas[0] : schemas);
}

export const SEO: React.FC<SEOProps> = ({
  title,
  description,
  canonical,
  robots,
  ogTitle,
  ogDescription,
  ogUrl,
  ogImage,
  ogType,
  twitterCard,
  twitterTitle,
  twitterDescription,
  twitterImage,
  jsonLd,
  breadcrumbs,
  faqs,
  config,
}) => {
  const effectiveTitle = title || config?.title || 'Interactive Event Games & Branded Mini-Games | Event Game Studio';
  const effectiveDesc =
    description ||
    config?.description ||
    'Create branded interactive games for corporate events, exhibitions, roadshows, product launches and brand activations with Event Game Studio.';
  
  // Format canonical cleanly
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  const defaultCanonical = `${SITE_DOMAIN}${currentPath === '/' ? '' : currentPath}`;
  const effectiveCanonical = canonical || config?.canonical || defaultCanonical;

  const effectiveRobots = robots || config?.robots || 'index, follow';
  const effectiveOgTitle = ogTitle || config?.ogTitle || effectiveTitle;
  const effectiveOgDesc = ogDescription || config?.ogDescription || effectiveDesc;
  const effectiveOgUrl = ogUrl || config?.ogUrl || effectiveCanonical;
  const effectiveOgImage = ogImage || config?.ogImage || DEFAULT_OG_IMAGE;
  const effectiveOgType = ogType || config?.ogType || 'website';

  const effectiveTwitterCard = twitterCard || config?.twitterCard || 'summary_large_image';
  const effectiveTwitterTitle = twitterTitle || config?.twitterTitle || effectiveOgTitle;
  const effectiveTwitterDesc = twitterDescription || config?.twitterDescription || effectiveOgDesc;
  const effectiveTwitterImage = twitterImage || config?.twitterImage || effectiveOgImage;

  const effectiveBreadcrumbs = breadcrumbs || config?.breadcrumbs;
  const effectiveFaqs = faqs || config?.faqs;

  useEffect(() => {
    // 1. Page Title
    document.title = effectiveTitle;

    // 2. Primary Meta Tags
    updateMetaTag('name', 'description', effectiveDesc);
    updateMetaTag('name', 'robots', effectiveRobots);
    updateCanonicalLink(effectiveCanonical);

    // 3. OpenGraph Tags
    updateMetaTag('property', 'og:type', effectiveOgType);
    updateMetaTag('property', 'og:site_name', SITE_NAME);
    updateMetaTag('property', 'og:title', effectiveOgTitle);
    updateMetaTag('property', 'og:description', effectiveOgDesc);
    updateMetaTag('property', 'og:url', effectiveOgUrl);
    updateMetaTag('property', 'og:image', effectiveOgImage);

    // 4. Twitter / X Cards
    updateMetaTag('name', 'twitter:card', effectiveTwitterCard);
    updateMetaTag('name', 'twitter:title', effectiveTwitterTitle);
    updateMetaTag('name', 'twitter:description', effectiveTwitterDesc);
    updateMetaTag('name', 'twitter:image', effectiveTwitterImage);

    // 5. Schema.org JSON-LD
    const schemas: Array<Record<string, any>> = [];
    if (config?.jsonLd) {
      if (Array.isArray(config.jsonLd)) {
        schemas.push(...config.jsonLd);
      } else {
        schemas.push(config.jsonLd);
      }
    } else if (jsonLd) {
      if (Array.isArray(jsonLd)) {
        schemas.push(...jsonLd);
      } else {
        schemas.push(jsonLd);
      }
    }

    if (effectiveBreadcrumbs && effectiveBreadcrumbs.length > 0) {
      schemas.push(getBreadcrumbSchema(effectiveBreadcrumbs));
    }

    if (effectiveFaqs && effectiveFaqs.length > 0) {
      schemas.push(getFaqPageSchema(effectiveFaqs));
    }

    if (schemas.length > 0) {
      updateJsonLd(schemas);
    }

    return () => {
      // Optional cleanup on unmount
    };
  }, [
    effectiveTitle,
    effectiveDesc,
    effectiveCanonical,
    effectiveRobots,
    effectiveOgType,
    effectiveOgTitle,
    effectiveOgDesc,
    effectiveOgUrl,
    effectiveOgImage,
    effectiveTwitterCard,
    effectiveTwitterTitle,
    effectiveTwitterDesc,
    effectiveTwitterImage,
    effectiveBreadcrumbs,
    effectiveFaqs,
    config,
    jsonLd,
  ]);

  return null;
};
