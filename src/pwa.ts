/**
 * PWA lifecycle, install prompt, and network connectivity manager.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaManagerOptions {
  installButtonId?: string;
  networkStatusId?: string;
}

export class PwaManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private installBtn: HTMLButtonElement | null = null;
  private statusBadge: HTMLElement | null = null;

  constructor(options: PwaManagerOptions = {}) {
    if (typeof window === "undefined") return;

    if (options.installButtonId) {
      this.installBtn = document.querySelector<HTMLButtonElement>(`#${options.installButtonId}`);
    }
    if (options.networkStatusId) {
      this.statusBadge = document.querySelector<HTMLElement>(`#${options.networkStatusId}`);
    }

    this.initInstallPrompt();
    this.initNetworkMonitoring();
  }

  /**
   * Check if running in installed standalone PWA mode.
   */
  public static isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
    const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return isStandaloneMedia || isIosStandalone;
  }

  private initInstallPrompt(): void {
    if (PwaManager.isStandalone()) {
      if (this.installBtn) this.installBtn.style.display = "none";
      return;
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      if (this.installBtn) {
        this.installBtn.style.display = "inline-flex";
        this.installBtn.setAttribute("aria-hidden", "false");
      }
    });

    if (this.installBtn) {
      this.installBtn.addEventListener("click", async () => {
        if (!this.deferredPrompt) return;
        await this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === "accepted") {
          this.installBtn!.style.display = "none";
        }
        this.deferredPrompt = null;
      });
    }

    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      if (this.installBtn) this.installBtn.style.display = "none";
      this.showTemporaryStatus("App installed!");
    });
  }

  private initNetworkMonitoring(): void {
    const updateStatus = () => {
      const isOnline = navigator.onLine;
      if (!this.statusBadge) return;

      if (!isOnline) {
        this.statusBadge.textContent = "Offline (Cached)";
        this.statusBadge.classList.add("is-offline");
        this.statusBadge.style.display = "inline-flex";
      } else {
        this.statusBadge.textContent = "Online";
        this.statusBadge.classList.remove("is-offline");
        // Hide after 3 seconds if online
        setTimeout(() => {
          if (navigator.onLine && this.statusBadge) {
            this.statusBadge.style.display = "none";
          }
        }, 3000);
      }
    };

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    if (!navigator.onLine) {
      updateStatus();
    }
  }

  private showTemporaryStatus(message: string, durationMs = 3000): void {
    if (!this.statusBadge) return;
    const originalText = this.statusBadge.textContent;
    this.statusBadge.textContent = message;
    this.statusBadge.style.display = "inline-flex";
    setTimeout(() => {
      if (this.statusBadge) {
        this.statusBadge.textContent = originalText;
        if (navigator.onLine) this.statusBadge.style.display = "none";
      }
    }, durationMs);
  }
}
