const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, saveToken, isTokenExpired, saveJson } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(queryId, accountIndex, proxy, baseURL, tokens, rfTokens) {
    this.headers = {
      Accept: "*/*",
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.baseURL = baseURL;
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.tokens = tokens || {};
    this.rfTokens = rfTokens || {};
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

    console.log(`[Tài khoản ${this.accountIndex + 1}] Tạo user agent...`.blue);
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

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      const telegramauth = this.queryId;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Can't create user agent, try get new query_id: ${error.message}`, "error");
      return;
    }
  }

  async log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(url, method, data = {}, retries = 0) {
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${this.token}`,
    };
    const proxyAgent = new HttpsProxyAgent(this.proxy);
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          httpsAgent: proxyAgent,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data };
      } catch (error) {
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại... ${currRetries}/${retries}`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries < retries && !success);
  }

  async auth() {
    const headers = {
      ...this.headers,
      Authorization: `tma ${this.queryId}`,
    };
    const proxyAgent = new HttpsProxyAgent(this.proxy);

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
          httpsAgent: proxyAgent,
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

  async runAccount() {
    try {
      this.proxyIP = await this.checkProxyIP();
    } catch (error) {
      this.log(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    const accountIndex = this.accountIndex;
    const initData = this.queryId;
    const queryData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    const firstName = queryData.first_name || "";
    const lastName = queryData.last_name || "";
    this.session_name = queryData.id;
    this.token = this.tokens?.[queryData.id];
    this.rfToken = this.rfTokens?.[queryData.id];

    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1}| ${firstName + " " + lastName} | ${this.proxyIP} | Bắt đầu sau ${timesleep} giây...`.green);
    this.#set_headers();
    await sleep(timesleep);

    const { access_token: token } = await this.getValidToken();
    if (!token) {
      this.log("Đăng nhập không thành công sau. Bỏ qua tài khoản.", "error");
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

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, hasIDAPI, tokens, rfTokens } = workerData;
  const to = new ClientAPI(queryId, accountIndex, proxy, hasIDAPI, tokens, rfTokens);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");
  let tokens = {};
  let rfTokens = {};

  try {
    tokens = require("./token.json");
    rfTokens = require("./refresh_token.json");
  } catch (error) {
    tokens = {};
    rfTokens = {};
  }

  if (queryIds.length > proxies.length) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/AirdropScript6)".yellow);
  let maxThreads = settings.MAX_THEADS;

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);
  // process.exit();
  queryIds.map((val, i) => new ClientAPI(val, i, proxies[i], hasIDAPI, null, null).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI,
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
            tokens,
            rfTokens,
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              // console.log(`message: ${message}`);
              resolve();
            });
            worker.on("error", (error) => {
              console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              worker.terminate();
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    await sleep(3);
    console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/AirdropScript6)".yellow);
    console.log(`=============Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    await sleep(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
