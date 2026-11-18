// Site Stage Configuration for AutoPulse (TEST vs. LIVE)
(function () {
  const DEFAULT_STAGE = "LIVE";

  function detectSiteStage() {
    try {
      if (typeof window !== "undefined" && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const qStage = (params.get("stage") || "").trim().toUpperCase();
        if (qStage === "TEST" || qStage === "LIVE") return qStage;
      }
      if (typeof localStorage !== "undefined") {
        const override = (
          localStorage.getItem("car-tracker:siteStage") ||
          localStorage.getItem("autopulse_site_stage") ||
          ""
        ).trim().toUpperCase();
        if (override === "TEST" || override === "LIVE") return override;
      }
    } catch (_) {}
    return DEFAULT_STAGE;
  }

  const SITE_STAGE = detectSiteStage();
  const IS_TEST_SITE = SITE_STAGE === "TEST";
  const IS_LIVE_SITE = SITE_STAGE === "LIVE";
  const DEFAULT_DB_NAME = IS_TEST_SITE ? "AutoPulseDB_Test" : "AutoPulseDB";

  const AutoPulseConfig = {
    SITE_STAGE,
    IS_TEST_SITE,
    IS_LIVE_SITE,
    DEFAULT_DB_NAME
  };

  if (typeof window !== "undefined") {
    window.AutoPulseConfig = AutoPulseConfig;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AutoPulseConfig;
  }
})();
