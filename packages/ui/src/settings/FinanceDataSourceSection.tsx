import { useCallback, useEffect, useState } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useServices } from "@/hooks/useServices.js";
import type { FinanceConnectionTestResult } from "@zcode/services";
import { SettingsGroupCard, SettingsRow } from "./SettingsPageParts.js";

/**
 * 金融数据源设置：Tushare token 管理 + 连接测试。
 * token 落在 ~/.zcode/finance.json（financeService 与 finance MCP server 共用的单一事实），
 * 不进 appSettings 明文；MCP server 侧读取同一文件。
 */
export function FinanceDataSourceSection() {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const services = useServices();
  const [configured, setConfigured] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<FinanceConnectionTestResult | null>(null);

  useEffect(() => {
    services.financeService
      ?.getConfig()
      .then((config) => setConfigured(config.tushareTokenConfigured))
      .catch(() => setConfigured(false));
  }, [services]);

  const handleSave = useCallback(async () => {
    const finance = services.financeService;
    if (!finance || !token.trim()) return;
    setSaving(true);
    try {
      await finance.updateTushareToken(token.trim());
      setToken("");
      setConfigured(true);
      setSavedAt(Date.now());
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: null,
      });
    } finally {
      setSaving(false);
    }
  }, [services, token]);

  const handleTest = useCallback(async () => {
    const finance = services.financeService;
    if (!finance) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await finance.testConnection());
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: null,
      });
    } finally {
      setTesting(false);
    }
  }, [services]);

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroupCard>
        <SettingsRow
          label={t("settings.financeDataSource.tokenLabel")}
          description={configured ? t("settings.financeDataSource.configured") : t("settings.financeDataSource.tokenHint")}
          control={
            <div className="flex items-center gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={configured ? "••••••••（已配置，可覆盖更新）" : "粘贴 Tushare Pro token"}
              className="h-8 w-72 rounded-lg border border-input-border bg-input px-2.5 font-mono text-ui-sm text-foreground outline-none focus:border-input-border-focused"
              data-testid="finance-tushare-token-input"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!token.trim() || saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("settings.financeDataSource.save")}
            </Button>
            {savedAt ? (
              <span className="text-ui-xs text-success">{t("settings.financeDataSource.saved")}</span>
            ) : null}
            </div>
          }
        />
        <SettingsRow
          label={t("settings.financeDataSource.endpointLabel")}
          description={t("settings.financeDataSource.endpointDesc")}
          control={
            <span className="font-mono text-ui-sm text-foreground-subtle">https://api.tushare.pro</span>
          }
        />
        <SettingsRow
          label={t("settings.financeDataSource.testLabel")}
          description={t("settings.financeDataSource.testDesc")}
          control={
            <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!configured || testing} onClick={() => void handleTest()}>
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("settings.financeDataSource.test")}
            </Button>
            {testResult ? (
              <span
                className={`flex items-center gap-1.5 text-ui-xs ${testResult.ok ? "text-success" : "text-destructive"}`}
              >
                {testResult.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                {testResult.message}
                {testResult.ok && testResult.latencyMs !== null ? ` · ${testResult.latencyMs}ms` : ""}
              </span>
            ) : null}
            </div>
          }
        />
      </SettingsGroupCard>
      <p className="text-ui-xs leading-relaxed text-foreground-subtlest">
        {t("settings.financeDataSource.compliance")}
      </p>
    </div>
  );
}
