"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type PortalLocale = "en" | "es";

const STORAGE_KEY = "mdn:portal-language:v1";

const messages: Record<PortalLocale, Record<string, string>> = {
  en: {
    "language.label": "Language",
    "language.english": "English",
    "language.spanish": "Español",
    "common.comingSoon": "Coming soon",
    "common.learnMore": "We are building this experience now.",
    "nav.workspace": "Workspace",
    "nav.system": "System",
    "nav.applications": "Applications",
    "nav.partners": "Partners",
    "nav.appointments": "Appointments",
    "nav.contacts": "Contacts",
    "nav.care": "Care",
    "nav.analytics": "Business Analytics",
    "nav.directoryAnalytics": "Directory analytics",
    "nav.services": "Services",
    "nav.calendars": "Booking calendars",
    "nav.supportInbox": "Support inbox",
    "nav.automations": "Communications",
    "nav.settings": "Settings",
    "nav.overview": "Overview",
    "nav.profile": "My profile",
    "nav.website": "My website",
    "nav.directory": "Directory",
    "nav.affiliates": "Affiliates",
    "nav.support": "Support",
    "nav.rewards": "Rewards",
    "nav.products": "Products",
    "nav.home": "Home",
    "menu.editProfile": "Edit profile",
    "menu.profileDetails": "Name and profile photo",
    "menu.install": "Install App",
    "menu.installed": "App installed",
    "menu.enableAlerts": "Enable appointment alerts",
    "menu.alertsEnabled": "Appointment alerts enabled",
    "menu.signOut": "Sign out",
    "menu.signingOut": "Signing out…",
    "partner.needHelp": "Need help?",
    "partner.helpCopy": "Our Partner team is here for you.",
    "partner.contactSupport": "Contact support",
    "partner.workspace": "Partner workspace",
    "partner.notifications": "Notifications",
    "partner.upToDate": "Up to date",
    "partner.noNotifications": "No new notifications.",
    "partner.viewAppointments": "View appointments",
    "admin.partnerAdmin": "Partner Admin",
    "admin.privateWorkspace": "Private workspace",
    "admin.privateOnly": "My Drip Nurse only",
    "feature.rewardsTitle": "Rewards are on the way.",
    "feature.rewardsBody": "A simpler way to recognize performance, consistency and excellent patient care is being prepared.",
    "feature.productsTitle": "Partner products are coming soon.",
    "feature.productsBody": "We are building a curated place for Partner supplies, tools and selected products.",
    "feature.preview": "A focused, professional experience is in development.",
  },
  es: {
    "language.label": "Idioma",
    "language.english": "English",
    "language.spanish": "Español",
    "common.comingSoon": "Próximamente",
    "common.learnMore": "Estamos construyendo esta experiencia.",
    "nav.workspace": "Espacio de trabajo",
    "nav.system": "Sistema",
    "nav.applications": "Solicitudes",
    "nav.partners": "Partners",
    "nav.appointments": "Citas",
    "nav.contacts": "Contactos",
    "nav.care": "Care",
    "nav.analytics": "Analítica del negocio",
    "nav.directoryAnalytics": "Analítica del directorio",
    "nav.services": "Servicios",
    "nav.calendars": "Calendarios de reservas",
    "nav.supportInbox": "Bandeja de soporte",
    "nav.automations": "Comunicaciones",
    "nav.settings": "Configuración",
    "nav.overview": "Resumen",
    "nav.profile": "Mi perfil",
    "nav.website": "Mi sitio web",
    "nav.directory": "Directorio",
    "nav.affiliates": "Afiliados",
    "nav.support": "Soporte",
    "nav.rewards": "Recompensas",
    "nav.products": "Productos",
    "nav.home": "Inicio",
    "menu.editProfile": "Editar perfil",
    "menu.profileDetails": "Nombre y foto de perfil",
    "menu.install": "Instalar app",
    "menu.installed": "App instalada",
    "menu.enableAlerts": "Activar alertas de citas",
    "menu.alertsEnabled": "Alertas de citas activadas",
    "menu.signOut": "Cerrar sesión",
    "menu.signingOut": "Cerrando sesión…",
    "partner.needHelp": "¿Necesitas ayuda?",
    "partner.helpCopy": "Nuestro equipo de Partners está disponible para ayudarte.",
    "partner.contactSupport": "Contactar soporte",
    "partner.workspace": "Espacio del Partner",
    "partner.notifications": "Notificaciones",
    "partner.upToDate": "Todo al día",
    "partner.noNotifications": "No hay notificaciones nuevas.",
    "partner.viewAppointments": "Ver citas",
    "admin.partnerAdmin": "Administración de Partners",
    "admin.privateWorkspace": "Espacio privado",
    "admin.privateOnly": "Solo My Drip Nurse",
    "feature.rewardsTitle": "Las recompensas vienen en camino.",
    "feature.rewardsBody": "Estamos preparando una forma sencilla de reconocer el rendimiento, la consistencia y una excelente atención al paciente.",
    "feature.productsTitle": "Los productos para Partners llegarán pronto.",
    "feature.productsBody": "Estamos creando un espacio seleccionado con suministros, herramientas y productos para Partners.",
    "feature.preview": "Una experiencia profesional y enfocada está en desarrollo.",
  },
};

type PortalLocaleContextValue = {
  locale: PortalLocale;
  setLocale: (locale: PortalLocale) => void;
  t: (key: string) => string;
};

const PortalLocaleContext = createContext<PortalLocaleContextValue | null>(null);

export function PortalLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<PortalLocale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== "es" && saved !== "en") return;
    const frame = window.requestAnimationFrame(() => setLocaleState(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setLocale = useCallback((nextLocale: PortalLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.cookie = `mdn_portal_language=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = nextLocale;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<PortalLocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => messages[locale][key] || messages.en[key] || key,
  }), [locale, setLocale]);

  return <PortalLocaleContext.Provider value={value}>{children}</PortalLocaleContext.Provider>;
}

export function usePortalLocale() {
  const context = useContext(PortalLocaleContext);
  if (!context) throw new Error("usePortalLocale must be used inside PortalLocaleProvider.");
  return context;
}
