const { log } = require("./utils"); // Adjust the path as necessary
const settings = require("./config/config");

const apiData = {
  "clayton": "https://tonclayton.fun/api/aT83M535-617h-5deb-a17b-6a335a67ffd5",
  "pineye": "https://api2.pineye.io/api",
  "memex": "https://memex-preorder.memecore.com",
  "pocketfi": "https://bot.pocketfi.org",
  "kat": "https://apiii.katknight.io/api",
  "pinai": "https://prod-api.pinai.tech",
  "hivera": "https://app.hivera.org",
  "midas": "https://api-tg-app.midas.app/api",
  "animix": "https://pro-api.animix.tech",
  "puparty": "https://tg-puparty-h5-api.puparty.com/api",
  "meshchain": "https://api.meshchain.ai/meshmain",
  "wizzwoods": "https://game-api.wizzwoods.com/api/v1",

  "copyright": "If the api changes please contact the tele team Airdrop Hunter Super Speed (https://t.me/AirdropScript6 for more information and updates!| Have any issues, please contact: https://t.me/AirdropScript6"
};

// Function to check the base API URL
async function checkBaseUrl() {
  console.log("Checking API...".blue);// If advanced anti-detection is enabled
  if (settings.ADVANCED_ANTI_DETECTION) {
    const result = await getBaseApi();
    if (result.endpoint) {
      log("No change in API!", "success");
      return result;
    } else {
      log("API change detected or no valid endpoint found.", "error");
      return result;
    }
  } else {
    // If advanced anti-detection is disabled, return the base URL from settings
    return {
      endpoint: settings.BASE_URL,
      message:
        "Nếu api thay đổi vui lòng liên hệ nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc) để biết thêm thông tin và cập nhật!| Have any issues, please contact: https://t.me/airdrophuntersieutoc",
    };
  }
}

// Function to get the base API details from the embedded JSON data
async function getBaseApi() {
  try {
    // Here we're using the hardcoded JSON data instead of fetching from a URL
    if (apiData?.meshchain) {
      return { endpoint: apiData.meshchain, message: apiData.copyright };
    } else {
      // If no valid endpoint is found, return a default message
      return {
        endpoint: null,
        message:"Nếu api thay đổi vui lòng liên hệ nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc) để biết thêm thông tin và cập nhật!| Have any issues, please contact: https://t.me/airdrophuntersieutoc",
      };
    }
  } catch (e) {
    // Log the error for debugging purposes
    log(`Error fetching base API: ${e.message}`, "error");
    return {
      endpoint: null,
      message:
        "Nếu api thay đổi vui lòng liên hệ nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc) để biết thêm thông tin và cập nhật!| Have any issues, please contact: https://t.me/airdrophuntersieutoc",
    };
  }
}

module.exports = { checkBaseUrl };