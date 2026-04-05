import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import jaActions from "./locales/ja/actions.json";
import jaApp from "./locales/ja/app.json";
import jaAuth from "./locales/ja/auth.json";
import jaCommon from "./locales/ja/common.json";
import jaCompanies from "./locales/ja/companies.json";
import jaDashboard from "./locales/ja/dashboard.json";
import jaErrors from "./locales/ja/errors.json";
import jaLayout from "./locales/ja/layout.json";
import jaAdmin from "./locales/ja/admin.json";
import jaRoutines from "./locales/ja/routines.json";
import jaIssues from "./locales/ja/issues.json";
import jaInstanceSettings from "./locales/ja/instanceSettings.json";
import jaIssuesList from "./locales/ja/issuesList.json";
import jaLiveUpdates from "./locales/ja/liveUpdates.json";
import jaNav from "./locales/ja/nav.json";
import jaNotFound from "./locales/ja/notFound.json";
import jaStatus from "./locales/ja/status.json";

void i18n.use(initReactI18next).init({
  lng: "ja",
  fallbackLng: "ja",
  supportedLngs: ["ja"],
  ns: [
    "common",
    "actions",
    "status",
    "errors",
    "nav",
    "app",
    "auth",
    "issues",
    "issuesList",
    "instanceSettings",
    "liveUpdates",
    "notFound",
    "companies",
    "dashboard",
    "layout",
    "admin",
    "routines",
  ],
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
  resources: {
    ja: {
      common: jaCommon,
      actions: jaActions,
      status: jaStatus,
      errors: jaErrors,
      nav: jaNav,
      app: jaApp,
      auth: jaAuth,
      issues: jaIssues,
      issuesList: jaIssuesList,
      instanceSettings: jaInstanceSettings,
      liveUpdates: jaLiveUpdates,
      notFound: jaNotFound,
      companies: jaCompanies,
      dashboard: jaDashboard,
      layout: jaLayout,
      admin: jaAdmin,
      routines: jaRoutines,
    },
  },
});

export default i18n;
