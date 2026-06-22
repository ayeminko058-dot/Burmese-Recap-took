import { AdMob, RewardAdPluginEvents } from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";

// Centralized state tracking for the AdMob singleton
let isRewardAdReady = false;
let isInitializing = false;
let isInitialized = false;

// Expose current ad readiness state
export function getIsRewardAdReady(): boolean {
  return isRewardAdReady;
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

    // Register persistent global loaded/failed listeners to maintain readystate
    await AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
      isRewardAdReady = true;
      console.log("[AdMob] Reward loaded");
    });

    await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (info) => {
      isRewardAdReady = false;
      console.error("[AdMob] Reward failed to load", info);
    });

    // Automatically trigger initial preload
    await preloadRewardAd();
  } catch (err) {
    console.warn("[AdMob] MobileAds initialization failed (or running in safe browser fallback):", err);
    isInitializing = false;
  }
}

// Preloading of next reward ad
export async function preloadRewardAd() {
  if (Capacitor.getPlatform() === "web") {
    // Browsers don't support preloading native ads
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
      console.log("[AdMob Fallback] Bypassing native ad trigger on brower platform.");
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
