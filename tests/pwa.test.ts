import { beforeEach, describe, expect, test } from "@rstest/core";
import { type BeforeInstallPromptEvent, PwaManager } from "../src/pwa";

describe("PwaManager", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="root">
        <span id="pwa-status" class="pwa-badge" style="display: none;"></span>
        <button id="pwa-install-btn" style="display: none;">Install</button>
      </div>
    `;
  });

  test("initializes without throwing error", () => {
    expect(() => {
      new PwaManager({
        installButtonId: "pwa-install-btn",
        networkStatusId: "pwa-status",
      });
    }).not.toThrow();
  });

  test("handles beforeinstallprompt event by revealing button", () => {
    new PwaManager({
      installButtonId: "pwa-install-btn",
      networkStatusId: "pwa-status",
    });

    const installBtn = document.querySelector<HTMLButtonElement>("#pwa-install-btn")!;
    expect(installBtn.style.display).toBe("none");

    const event = new Event("beforeinstallprompt") as unknown as BeforeInstallPromptEvent;
    Object.assign(event, {
      platforms: ["web"],
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: "dismissed" as const, platform: "web" }),
    });
    window.dispatchEvent(event);

    expect(installBtn.style.display).toBe("inline-flex");
  });

  test("updates status badge when network goes offline and online", () => {
    new PwaManager({
      installButtonId: "pwa-install-btn",
      networkStatusId: "pwa-status",
    });

    const statusBadge = document.querySelector<HTMLElement>("#pwa-status")!;

    // Simulate going offline
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));

    expect(statusBadge.textContent).toBe("Offline (Cached)");
    expect(statusBadge.classList.contains("is-offline")).toBe(true);
    expect(statusBadge.style.display).toBe("inline-flex");

    // Simulate going online
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.dispatchEvent(new Event("online"));

    expect(statusBadge.textContent).toBe("Online");
    expect(statusBadge.classList.contains("is-offline")).toBe(false);
  });
});
