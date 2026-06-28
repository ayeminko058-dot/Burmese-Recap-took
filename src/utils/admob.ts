import { AdMob, RewardAdPluginEvents, InterstitialAdPluginEvents } from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";

// Centralized state tracking for the AdMob singletons
let isRewardAdReady = false;
let isInterstitialAdReady = false;
let isInitializing = false;
let isInitialized = false;

// Expose current ad readiness states
export function getIsRewardAdReady(): boolean {
  return isRewardAdReady;
}

export function getIsInterstitialAdReady(): boolean {
  return isInterstitialAdReady;
}

// Global initialization of AdMob on App Mount
export async function initializeAdMob() {
  if (isInitialized || isInitializing) return;
  isInitializing = true;

  try {
    console.log("[AdMob] Initializing AdMob SDK...");

    if (Capacitor.getPlatform() === "web") {
      console.log("[AdMob Sandbox] Safe initialization bypass (e.g. running on browser / web preview platform).");
      isInitialized = true;
      isInitializing = false;
      return;
    }

    // Call native initialization
    await AdMob.initialize({
      initializeForTesting: true,
    });

    console.log("[AdMob] AdMob initialized successfully");
    isInitialized = true;
    isInitializing = false;

    // Register persistent global loaded/failed listeners for Reward Ads
    await AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
      isRewardAdReady = true;
      console.log("[AdMob] Reward loaded successfully");
    });

    await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (info) => {
      isRewardAdReady = false;
      console.error("[AdMob] Reward failed to load", info);
    });

    // Register persistent global loaded/failed listeners for Interstitial Ads
    await AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
      isInterstitialAdReady = true;
      console.log("[AdMob] Interstitial loaded successfully");
    });

    await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (info) => {
      isInterstitialAdReady = false;
      console.error("[AdMob] Interstitial failed to load", info);
    });

    // Automatically trigger initial preloads with a safe delay to allow device sandbox and webview network threads to settle
    setTimeout(() => {
      preloadRewardAd().catch(err => console.warn("[AdMob] Deferred Reward preload failed:", err));
      preloadInterstitialAd().catch(err => console.warn("[AdMob] Deferred Interstitial preload failed:", err));
    }, 3000);
  } catch (err) {
    console.warn("[AdMob] MobileAds initialization failed (or running in safe browser fallback):", err);
    isInitializing = false;
  }
}

// Preloading of next reward ad
export async function preloadRewardAd() {
  if (Capacitor.getPlatform() === "web") {
    return;
  }

  try {
    console.log("[AdMob] Reward request started");
    isRewardAdReady = false;
    
    await AdMob.prepareRewardVideoAd({
      adId: "ca-app-pub-3940256099942544/5224354917", // Test Reward Ad ID
    });
    
    console.log("[AdMob] Reward loaded in background");
  } catch (err) {
    console.warn("[AdMob] Reward failed during background preparation:", err);
  }
}

// Preloading of next interstitial ad
export async function preloadInterstitialAd() {
  if (Capacitor.getPlatform() === "web") {
    return;
  }

  try {
    console.log("[AdMob] Interstitial request started");
    isInterstitialAdReady = false;

    await AdMob.prepareInterstitial({
      adId: "ca-app-pub-3940256099942544/1033173712", // Test Interstitial Ad ID
    });

    console.log("[AdMob] Interstitial loaded in background");
  } catch (err) {
    console.warn("[AdMob] Interstitial failed during background preparation:", err);
  }
}

/**
 * Triggers an Interstitial Ad and executes the success callback once the user has dismissed/finished the ad.
 * Handles fallback gracefully if AdMob or native modules are not available (e.g., in a browser).
 */
export async function triggerInterstitialAd(
  promptMessage: string,
  onSuccess: () => void,
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void,
  onFinish?: () => void
) {
  let isCompleted = false;
  let safetyTimeout: any = null;

  const handleSuccess = () => {
    if (isCompleted) return;
    isCompleted = true;
    if (safetyTimeout) clearTimeout(safetyTimeout);
    onSuccess();
    if (onFinish) onFinish();
  };

  try {
    // Prompt the user for approval
    const promptFull = `${promptMessage}\n\nအခမဲ့ အသုံးပြုနိုင်ရန်အတွက် စက္ကန့်အနည်းငယ်ကြာ လျှပ်တပြတ်ကြော်ငြာ (Interstitial Ad) ကို ကြည့်ရှုပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။ ကြော်ငြာကြည့်ရှုရန် သဘောတူပါသလား?`;
    const confirmed = typeof (window as any).customConfirm === "function"
      ? await (window as any).customConfirm(promptFull, "လျှပ်တပြတ်ကြော်ငြာကြည့်ရှုရန်")
      : window.confirm(promptFull);

    if (!confirmed) {
      onAddNotification(
        "ဒီအင်္ဂါရပ်ကို အသုံးပြုရန် ကြော်ငြာကြည့်ရန် လိုအပ်သည်",
        "ကြော်ငြာမကြည့်ဘဲ ဤလုပ်ဆောင်ချက်ကို အသုံးပြု၍မရပါ။",
        "warning"
      );
      if (onFinish) onFinish();
      return;
    }

    // Trigger loading UI notification
    onAddNotification("ကြော်ငြာတင်နေပါသည်", "လျှပ်တပြတ်ကြော်ငြာကို စတင်ဖွင့်လှစ်နေပါသည်။ ခေတ္တစောင့်ဆိုင်းပါ။", "info");

    // Safety fallback timeout set to exactly 5 seconds
    safetyTimeout = setTimeout(() => {
      if (!isCompleted) {
        console.warn("[AdMob Timeout] Safety fallback triggered after 5 seconds of loading");
        onAddNotification(
          "စမ်းသပ်မှုစနစ် (Bypassed)",
          "ကြော်ငြာ ဆာဗာအလုပ်မလုပ်သေးသောကြောင့် ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
          "success"
        );
        handleSuccess();
        // Trigger preloading for next attempt
        preloadInterstitialAd();
      }
    }, 5000);

    // If on web, we bypass immediately with helper message
    if (Capacitor.getPlatform() === "web") {
      console.log("[AdMob Fallback] Bypassing native ad trigger on browser platform.");
      setTimeout(() => {
        if (!isCompleted) {
          onAddNotification(
            "စမ်းသပ်မှုစနစ် (Bypassed)",
            "Browser Preview အောက်တွင် စမ်းသပ်နေသဖြင့် ကြော်ငြာကို ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
            "success"
          );
          handleSuccess();
        }
      }, 400); // Small duration to simulate preparation
      return;
    }

    // Check if Interstitial Ad is loaded and ready
    if (!isInterstitialAdReady) {
      console.log("[AdMob] Interstitial ad is not ready yet, attempting immediate lazy load...");
      try {
        await AdMob.prepareInterstitial({
          adId: "ca-app-pub-3940256099942544/1033173712",
        });
        isInterstitialAdReady = true;
      } catch (lazyErr) {
        console.warn("[AdMob] Interstitial lazy load failed:", lazyErr);
      }
    }

    // Double check availability before showing
    if (!isInterstitialAdReady) {
      console.warn("[AdMob] Interstitial ad still not ready, bypassing to avoid blocking user...");
      if (safetyTimeout) clearTimeout(safetyTimeout);
      onAddNotification(
        "စမ်းသပ်မှုစနစ် (Bypassed)",
        "ကြော်ငြာနမူနာ မရှိသေးသဖြင့် သင့်လုပ်ဆောင်ချက်ကို တိုက်ရိုက် ခွင့်ပြုလိုက်ပါသည်။",
        "success"
      );
      handleSuccess();
      preloadInterstitialAd();
      return;
    }

    console.log("[AdMob] Interstitial request started (Presenting Ad)");

    // Register dismissal listen
    const dismissListener = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      console.log("[AdMob] Interstitial dismissed");
      dismissListener.remove();
      onAddNotification("🎉 အောင်မြင်ပါသည်", "လှုပ်ရှားမှု ပြီးမြောက်သွားသဖြင့် လုပ်ဆောင်ချက်ကို ခွင့်ပြုလိုက်ပါပြီ။", "success");
      handleSuccess();
      preloadInterstitialAd();
    });

    const failedToShowListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (info) => {
      console.warn("[AdMob] Interstitial failed to show:", info);
      dismissListener.remove();
      failedToShowListener.remove();
      if (!isCompleted) {
        if (safetyTimeout) clearTimeout(safetyTimeout);
        onAddNotification(
          "စမ်းသပ်မှုစနစ် (Bypassed)",
          "ပြသမှု ချို့ယွင်းချက်ကြောင့် ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
          "success"
        );
        handleSuccess();
        preloadInterstitialAd();
      }
    });

    // Actually show
    await AdMob.showInterstitial();
    console.log("[AdMob] Interstitial shown successfully");

  } catch (err) {
    console.error("[AdMob] Interstitial failed or failed to show:", err);
    if (!isCompleted) {
      if (safetyTimeout) clearTimeout(safetyTimeout);
      onAddNotification(
        "စမ်းသပ်မှုစနစ် (Bypassed)",
        "AdMob background exception, ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
        "success"
      );
      handleSuccess();
      preloadInterstitialAd();
    }
  }
}

/**
 * Triggers a Reward Video Ad and executes the success callback once the user has finished listening/watching.
 * Handles fallback gracefully if AdMob or native modules are not available (e.g., in a browser).
 */
export async function triggerRewardAd(
  promptMessage: string,
  onSuccess: () => void,
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void
) {
  let isCompleted = false;
  let safetyTimeout: any = null;

  const handleSuccess = () => {
    if (isCompleted) return;
    isCompleted = true;
    if (safetyTimeout) clearTimeout(safetyTimeout);
    onSuccess();
  };

  try {
    // Prompt the user for approval
    const promptFull = `${promptMessage}\n\nအခမဲ့ အသုံးပြုနိုင်ရန်အတွက် စက္ကန့်အနည်းငယ်ကြာ ဗီဒီယိုကြော်ငြာကို ပြီးဆုံးသည်အထိ ကြည့်ရှုပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။ ကြော်ငြာကြည့်ရှုရန် သဘောတူပါသလား?`;
    const confirmed = typeof (window as any).customConfirm === "function"
      ? await (window as any).customConfirm(promptFull, "ဗီဒီယိုကြော်ငြာကြည့်ရှုရန်")
      : window.confirm(promptFull);

    if (!confirmed) {
      onAddNotification(
        "ဒီအင်္ဂါရပ်ကို အသုံးပြုရန် ကြော်ငြာကြည့်ရန် လိုအပ်သည်",
        "ဗီဒီယိုကြော်ငြာမကြည့်ဘဲ ဤလုပ်ဆောင်ချက်ကို အသုံးပြု၍မရပါ။",
        "warning"
      );
      return;
    }

    // Trigger loading UI notification
    onAddNotification("ကြော်ငြာတင်နေပါသည်", "ဗီဒီယိုကြော်ငြာကို စတင်ဖွဲ့စည်းနေပါသည်။ ပြီးဆုံးသည်အထိ ခေတ္တစောင့်ဆိုင်းပါ။", "info");

    // Safety fallback timeout set to exactly 5 seconds
    safetyTimeout = setTimeout(() => {
      if (!isCompleted) {
        console.warn("[AdMob Timeout] Safety fallback triggered after 5 seconds of loading");
        onAddNotification(
          "စမ်းသပ်မှုစနစ် (Bypassed)",
          "ကြော်ငြာ ဆာဗာအလုပ်မလုပ်သေးသောကြောင့် ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
          "success"
        );
        handleSuccess();
        // Trigger preloading for next attempt
        preloadRewardAd();
      }
    }, 5000);

    // If on web, we bypass immediately with helper message
    if (Capacitor.getPlatform() === "web") {
      console.log("[AdMob Fallback] Bypassing native ad trigger on browser platform.");
      setTimeout(() => {
        if (!isCompleted) {
          onAddNotification(
            "စမ်းသပ်မှုစနစ် (Bypassed)",
            "Browser Preview အောက်တွင် စမ်းသပ်နေသဖြင့် ကြော်ငြာကို ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
            "success"
          );
          handleSuccess();
        }
      }, 400); // Small duration to simulate preparation
      return;
    }

    // If we're on native, find out if the ad is preloaded
    if (!isRewardAdReady) {
      console.log("[AdMob] Ad is not ready yet, attempting immediate lazy load...");
      await AdMob.prepareRewardVideoAd({
        adId: "ca-app-pub-3940256099942544/5224354917",
      });
      isRewardAdReady = true;
    }

    console.log("[AdMob] Reward request started (Presenting Ad)");
    let adRewarded = false;

    // Registers dynamic listeners for this show phase
    const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (info) => {
      console.log("[AdMob] Reward earned:", info);
      adRewarded = true;
    });

    const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      console.log("[AdMob] Reward dismissed");
      rewardListener.remove();
      dismissListener.remove();

      if (adRewarded) {
        onAddNotification("🎉 အောင်မြင်ပါသည်", "ကြော်ငြာကြည့်ရှုခြင်း ပြီးဆုံးသဖြင့် လုပ်ဆောင်ချက်ကို ခွင့်ပြုလိုက်ပါပြီ။", "success");
        handleSuccess();
      } else {
        if (!isCompleted) {
          if (safetyTimeout) clearTimeout(safetyTimeout);
          onAddNotification(
            "ကြော်ငြာမပြီးဆုံးသေးပါ",
            "ကြော်ငြာကို ဆုံးအောင်ကြည့်မှသာ ဤစနစ်ကို အသုံးပြုခွင့်ရရှိပါမည်။",
            "warning"
          );
          // Preload next
          preloadRewardAd();
        }
      }
    });

    // Actually show
    await AdMob.showRewardVideoAd();
    console.log("[AdMob] Reward shown");

  } catch (err) {
    console.error("[AdMob] Reward failed or failed to show:", err);
    if (!isCompleted) {
      if (safetyTimeout) clearTimeout(safetyTimeout);
      onAddNotification(
        "စမ်းသပ်မှုစနစ် (Bypassed)",
        "AdMob background exception, ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
        "success"
      );
      handleSuccess();
      preloadRewardAd();
    }
  }
}
