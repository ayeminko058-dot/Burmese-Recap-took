import { AdMob, RewardAdPluginEvents } from "@capacitor-community/admob";

/**
 * Triggers a Reward Video Ad and executes the success callback once the user has finished listening/watching.
 * Handles fallback gracefully if AdMob or native modules are not available (e.g., in a browser).
 *
 * @param promptMessage - The Burmese warning/prompt message displayed to the user
 * @param onSuccess - The callback function executed once the reward is earned
 * @param onAddNotification - App notification dispatcher
 */
export async function triggerRewardAd(
  promptMessage: string,
  onSuccess: () => void,
  onAddNotification: (title: string, message: string, type: "info" | "success" | "warning") => void
) {
  try {
    // 1. Prompt the user with a clean, high-fidelity native confirm dialog
    const confirmed = window.confirm(
      `🔔 ${promptMessage}\n\nအခမဲ့ အသုံးပြုနိုင်ရန်အတွက် စက္ကန့်အနည်းငယ်ကြာ ဗီဒီယိုကြော်ငြာကို ပြီးဆုံးသည်အထိ ကြည့်ရှုပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။ ကြော်ငြာကြည့်ရှုရန် သဘောတူပါသလား?`
    );

    if (!confirmed) {
      onAddNotification(
        "ဒီအင်္ဂါရပ်ကို အသုံးပြုရန် ကြော်ငြာကြည့်ရန် လိုအပ်သည်",
        "ဗီဒီယိုကြော်ငြာမကြည့်ဘဲ ဤလုပ်ဆောင်ချက်ကို အသုံးပြု၍မရပါ။",
        "warning"
      );
      return;
    }

    onAddNotification("ကြော်ငြာစတင်နေပါသည်", "ဗီဒီယိုကြော်ငြာကို စတင်ဖွင့်လှစ်နေပါသည်။ ဆုံးအောင်ကြည့်ပေးပါ။", "info");

    // 2. Prepare the Reward Video Ad using the official test ID
    await AdMob.prepareRewardVideoAd({
      adId: "ca-app-pub-3940256099942544/5224354917",
    });

    let adRewarded = false;

    // 3. Register standard listener for the reward confirmation event
    const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (info) => {
      console.log("AdMob reward earned:", info);
      adRewarded = true;
    });

    // 4. Register listener for the ad dismissal event
    const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      // Clean up listeners
      rewardListener.remove();
      dismissListener.remove();

      if (adRewarded) {
        onAddNotification("🎉 အောင်မြင်ပါသည်", "ကြော်ငြာကြည့်ရှုခြင်း ပြီးဆုံးသဖြင့် လုပ်ဆောင်ချက်ကို ခွင့်ပြုလိုက်ပါပြီ။", "success");
        onSuccess();
      } else {
        onAddNotification(
          "ကြော်ငြာမပြီးဆုံးသေးပါ",
          "ကြော်ငြာကို ဆုံးအောင်ကြည့်မှသာ ဤစနစ်ကို အသုံးပြုခွင့်ရရှိပါမည်။",
          "warning"
        );
      }
    });

    // 5. Present the active reward video ad
    await AdMob.showRewardVideoAd();

  } catch (err) {
    console.warn("[AdMob Fallback] Reward ad failed or unavailable in browser:", err);
    // Silent and smooth bypass for web review preview sandbox
    onAddNotification(
      "စမ်းသပ်မှုစနစ် (Bypassed)",
      "Browser Preview အောက်တွင် စမ်းသပ်နေသဖြင့် ကြော်ငြာကို ကျော်ဖြတ်ပြီး အောင်မြင်စွာ ခွင့်ပြုလိုက်သည်။",
      "success"
    );
    onSuccess();
  }
}
