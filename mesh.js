const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, saveToken, isTokenExpired, saveJson } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(accountIndex, initData, session_name, baseURL, token, rfToken) {
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://miniapp.meshchain.ai",
      referer: "https://miniapp.meshchain.ai/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    this.baseURL = baseURL;
    this.token = token;
    this.rfToken = rfToken;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Create user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, retries = 1) {
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${this.token}`,
    };
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data };
      } catch (error) {
        this.log(`Request failed: ${url} | ${error.message} | trying again... ${currRetries}/${retries}`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries <= retries && !success);
  }

  async auth() {
    const headers = {
      ...this.headers,
      Authorization: `tma ${this.queryId}`,
    };
    let currRetries = 0,
      success = false;
    const url = `${this.baseURL}/auth/telegram-miniapp-signin`;
    do {
      currRetries++;
      try {
        const response = await axios({
          method: "POST",
          url,
          data: JSON.stringify({ referral_code: settings.REF_ID || "T_1092680235" }),
          headers,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data };
      } catch (error) {
        success = false;
        return { success: false, error: error.message };
      }
    } while (currRetries < retries && !success);
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/user/profile`, "get");
  }

  async getBalanceInfo() {
    return this.makeRequest(`${this.baseURL}/wallet/tokens`, "get");
  }

  async nodeStatus() {
    return this.makeRequest(`${this.baseURL}/nodes/status`, "post", { unique_id: this.session_name });
  }

  async nodeStart() {
    return this.makeRequest(`${this.baseURL}/rewards/start`, "post", { unique_id: this.session_name });
  }

  async estimate() {
    return this.makeRequest(`${this.baseURL}/rewards/estimate`, "post", { unique_id: this.session_name });
  }
  async nodeClaim() {
    return this.makeRequest(`${this.baseURL}/rewards/claim`, "post", { unique_id: this.session_name });
  }

  async reffInfo() {
    return this.makeRequest(`${this.baseURL}/referral/info`, "get");
  }

  async reffClaim() {
    return this.makeRequest(`${this.baseURL}/referral/claim`, "post", {});
  }

  async missionLists() {
    return this.makeRequest(`${this.baseURL}/mission`, "get");
  }

  async missionClaim(mission_id) {
    return this.makeRequest(`${this.baseURL}/mission/claim`, "post", { mission_id: mission_id });
  }

  async refreshToken() {
    return this.makeRequest(`${this.baseURL}/auth/refresh-token`, "post", { refresh_token: this.rfToken });
  }

  async bindWebTele() {
    return this.makeRequest(`${this.baseURL}/auth/link/telegram`, "post", { tg_data: this.queryId });
  }

  async getValidToken(isRf = false) {
    const userId = this.session_name;
    const existingToken = this.token;
    const existingRefreshToken = this.rfToken;
    let loginResult = null;

    // && !isTokenExpired(existingToken)
    if (!isRf && existingToken && !isTokenExpired(existingToken)) {
      this.log("Using valid token", "success");
      return { access_token: existingToken, refresh_token: existingRefreshToken };
    } else if (!isRf && existingToken && isTokenExpired(existingToken)) {
      this.log("Token expired, refreshing token...", "info");
      await this.getValidToken(true);
    } else if (isRf && existingRefreshToken && !isTokenExpired(existingRefreshToken)) {
      loginResult = await this.refreshToken();
    } else {
      this.log("Token not found or expired, logging in...", "warning");
      loginResult = await this.auth();
    }
    // console.log(loginResult);
    const { refresh_token, access_token } = loginResult?.data;
    if (loginResult.success) {
      if (access_token) {
        saveToken(userId, access_token);
        this.token = access_token;
      }
      if (refresh_token) {
        saveJson(userId, refresh_token, "refresh_token.json");
        this.rfToken = refresh_token;
      }
      return { access_token: access_token, refresh_token: refresh_token };
    } else {
      this.log(`Can't get token, try get new query_id!`, "warning");
    }
    return null;
  }

  async handleTasks() {
    const resTasks = await this.missionLists();
    if (resTasks.success) {
      const tasks = resTasks.data.filter((task) => !settings.SKIP_TASKS.includes(task.id) && !task.claimed_at);
      if (tasks.length == 0) {
        return this.log(`No tasks to do!`, "warning");
      }
      for (const task of tasks) {
        this.log(`Completting task ID: ${task.id} | Title: ${task.name}...`);
        await sleep(1);
        const { client_tasks } = task;

        try {
          if (client_tasks[1] && client_tasks[1].type == "WAIT") {
            this.log(`Waiting for ${client_tasks[1].payload} seconds to claim the task...`);
            await sleep(client_tasks[1].payload);
          }
        } catch (error) {}

        const resClaim = await this.missionClaim(task.id);
        if (resClaim.success) {
          this.log(`Completed task ${task.id} | ${task.name} successfully!`, "success");
        } else {
          this.log(`Completed task ${task.id} | ${task.name} failed!`, "warning");
        }
      }
    } else {
      this.log(`Can't get tasks.`, "warning");
    }
  }

  async handleRef() {
    const refInfo = await this.reffInfo();
    if (refInfo.success) {
      const { claimable_amount } = refInfo.data;
      if (claimable_amount <= 0) return;
      const resClaim = await this.reffClaim();
      if (resClaim.success) {
        this.log(`Claim ref reward successfully!`, "success");
      }
    }
  }

  async handleMining() {
    this.log(`Checking node status...`);
    const resNodeStatus = await this.nodeStatus();
    if (resNodeStatus.success) {
      const { name, unique_id, hash_rate, today_reward, total_reward, cycle_started_at, cycle_ended_at } = resNodeStatus.data;
      if (!cycle_ended_at) {
        this.log(`Username: ${name} | [Total reward mining: ${total_reward} | Today reward: ${today_reward}] Start minning cycle...`);
        const resStart = await this.nodeStart();
        if (resStart.success) {
          const endNodeUTC = new Date(resStart.data.cycle_ended_at);
          const endNodeWIB = endNodeUTC.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
          this.log(`Start mining cycle successfully | Claim at: ${endNodeWIB}`, "success");
        } else {
          this.log(`Start mining cycle failed!`, "warning");
        }
      } else {
        const now = new Date();
        const endNodeUTC = new Date(cycle_ended_at);
        const endNodeWIB = endNodeUTC.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const estimateRes = await this.estimate();
        if (now >= endNodeUTC) {
          if (estimateRes.success) {
            const { claim_fee, claimable } = estimateRes.data;
            if (claimable) {
              const claimRes = await this.nodeClaim();
              if (claimRes.success) {
                this.log(`[ Node Is Claimed ] [ Reward: +${claimRes.data.total_reward} points]`, "success");
              } else {
                this.log(`[ Node Isn't Claimed ]`, "warning");
              }
            } else {
              this.log(`[ Node Isn't Claimed ] [ Reason Fees Not Enough ]`, "warning");
            }
          }
        } else {
          this.log(`[ Node Not Time to Claim ] [ Claim at ${endNodeWIB} ]`, "warning");
        }
      }
    } else {
      this.log(`[ Node Data Is None ]`, "warning");
    }
  }

  async processAccount() {
    const { access_token: token } = await this.getValidToken();
    if (!token) {
      this.log("Login failed after. Skip account.", "error");
      return;
    }

    const userData = await this.getUserInfo();
    const balanceInfo = await this.getBalanceInfo();

    if (userData.success) {
      const balances = balanceInfo.data.data;

      const symbols = ["POINT", "BNB"];
      const balance = Object.fromEntries(balances.filter((item) => symbols.includes(item.symbol)).map((item) => [item.symbol, item.balance]));
      const point = parseFloat(balance["POINT"]);
      const bnb = parseFloat(balance["BNB"]) / 1e18;
      const { name, email, auth_providers } = userData.data;

      this.log(`Username: ${name} | Email: ${email} | Points: ${point.toFixed(2)} | BNB:${bnb}`);

      await this.handleRef();

      if (settings.AUTO_TASK) {
        await this.handleTasks();
      }

      await this.handleMining();
    } else {
      return this.log("Can't get use info...skipping", "error");
    }
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Wait ${Math.floor(i / 60)} minute ${i % 60} seconds to continue`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Start new loop...`);
}




const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Prompt user for the key
  rl.question('Enter the key to unlock the script: ', async (key) => {
    if (key === 'Arain') {
      console.clear();
      console.log(
        colors.yellow(`
          Tool developed by Airdrop Hunter Zain Arain (https://t.me/AirdropScript6)
          
          ░▀▀█░█▀█░▀█▀░█▀█
          ░▄▀░░█▀█░░█░░█░█
          ░▀▀▀░▀░▀░▀▀▀░▀░▀

          ╔══════════════════════════════════╗
          ║                                  ║
          ║  ZAIN ARAIN                      ║
          ║  AUTO SCRIPT MASTER              ║
          ║                                  ║
          ║  JOIN TELEGRAM CHANNEL NOW!      ║
          ║  https://t.me/AirdropScript6     ║
          ║  @AirdropScript6 - OFFICIAL      ║
          ║  CHANNEL                         ║
          ║                                  ║
          ║  FAST - RELIABLE - SECURE        ║
          ║  SCRIPTS EXPERT                  ║
          ║                                  ║
          ╚══════════════════════════════════╝
        `)
      );

      rl.close();
      await startProcessing(); // Call main processing logic
    } else {
      console.log(colors.red('Incorrect key! Exiting...'));
      rl.close();
      process.exit(1); // Exit script immediately
    }
  });
}

async function startProcessing() {
  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) {
    console.log(colors.red('API ID not found, try again later!'));
    return;
  }
  console.log(colors.yellow(message));

  const data = loadData('data.txt');
  let tokens = {};
  let rfTokens = {};

  try {
    tokens = JSON.parse(fs.readFileSync('./token.json', 'utf8'));
    rfTokens = JSON.parse(fs.readFileSync('./refresh_token.json', 'utf8'));
  } catch (error) {
    console.log(colors.red('Token files not found. Starting with empty tokens.'));
  }

  const maxThreads = settings.MAX_THREADS_NO_PROXY || 1; // Default to 1 if undefined

  while (true) {
    for (let i = 0; i < data.length; i += maxThreads) {
      const batch = data.slice(i, i + maxThreads);

      const promises = batch.map(async (initData, indexInBatch) => {
        const accountIndex = i + indexInBatch;
        const userData = JSON.parse(
          decodeURIComponent(initData.split('user=')[1].split('&')[0])
        );
        const firstName = userData.first_name || '';
        const lastName = userData.last_name || '';
        const sessionName = userData.id;

        console.log(colors.green(`========= Account ${accountIndex + 1} | ${firstName} ${lastName}`));
        const client = new ClientAPI(
          accountIndex,
          initData,
          sessionName,
          hasIDAPI,
          tokens[userData.id],
          rfTokens[userData.id]
        );
        client.set_headers();

        return timeout(client.processAccount(), 24 * 60 * 60 * 1000).catch((err) => {
          console.error(colors.red(`Account processing error: ${err.message}`));
        });
      });

      await Promise.allSettled(promises);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    console.log(colors.magenta(`Complete all accounts | Wait for ${settings.TIME_SLEEP} minutes.`));
    if (settings.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP) {
      await wait(settings.TIME_SLEEP * 60);
    } else {
      await sleep(settings.TIME_SLEEP * 60);
    }
  }
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout'));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

main().catch((err) => {
  console.error(colors.red(err.message));
  process.exit(1);
});