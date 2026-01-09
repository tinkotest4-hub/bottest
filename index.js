require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = Number(process.env.ADMIN_ID);
const DB_FILE = './database.json';

// ------------------- DATABASE -------------------
let db = { users: {}, deposits: {}, orders: {} };
if (fs.existsSync(DB_FILE)) {
try { db = JSON.parse(fs.readFileSync(DB_FILE)); }
catch (e) { db = { users: {}, deposits: {}, orders: {} }; }
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

let sessions = {}; // temporary session storage

// ------------------- SERVICES -------------------
const SERVICES = {
  Telegram: {
    Premium: [
      { id: "tp1", name: "Premium Members", price: 50, min: 100, desc: "Boost your channel ranks." },
      { id: "tp2", name: "Channel Boost", price: 65, min: 200, desc: "Boost your channel ranker to deliver." }
    ],
    Followers: [
      { id: "tf1", name: "Standard Followers", price: 10, min: 50, desc: "Real followers." }
    ]
  },
  Instagram: {},
  Twitter: {},
  Facebook: {}
};


// ------------------- CRYPTO ADDRESSES -------------------
const CRYPTO = {
BTC: 'YOUR_BTC_ADDRESS',
USDT: 'YOUR_USDT_ADDRESS',
ETH: 'YOUR_ETH_ADDRESS',
BNB: 'YOUR_BNB_ADDRESS'
};

// ------------------- HELPER: START MENU -------------------
function startMenu(id) {
sessions[id] = {}; // clear session
const bal = db.users[id]?.balance || 0;
const buttons = [
[{ text: "💳 Deposit", callback_data: "goto_deposit" }, { text: "📣 Services", callback_data: "goto_services" }],
[{ text: "📦 My Orders", callback_data: "goto_orders" }, { text: "💬 Support", callback_data: "goto_support" }]
];
if (id === ADMIN_ID) buttons.push([{ text: "👑 Admin Dashboard", callback_data: "admin_dashboard" }]);

bot.sendMessage(id, `💰 Balance: $${bal.toFixed(2)}\nWhat would you like to do?`, {
reply_markup: { inline_keyboard: buttons }
});
}

// ------------------- /START COMMAND -------------------
bot.onText(/\/start/, (msg) => {
const id = msg.chat.id;
if (!db.users[id]) {
db.users[id] = { balance: 0.0, name: msg.from.first_name };
saveDB();
bot.sendMessage(ADMIN_ID, `👤 New User: ${msg.from.first_name} (${id})`);
}
startMenu(id);
});

// ------------------- MESSAGE HANDLER -------------------
bot.on('message', (msg) => {
const id = msg.chat.id;
const text = msg.text;
if (!text || text.startsWith('/')) return;
const s = sessions[id] || {};

// Custom deposit amount
if (s.step === 'CUSTOM_DEPOSIT') {
  const customAmt = parseFloat(text);
  if (isNaN(customAmt) || customAmt < 10) {
    return bot.sendMessage(id, "❌ Amount must be at least $10. Try again:");
  }
  sessions[id].depositAmount = customAmt;
  delete sessions[id].step;

  const btns = Object.keys(CRYPTO).map(c => [
    { text: c, callback_data: `pay_${c}` }
  ]);
  btns.push([{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]);

  return bot.sendMessage(id, `💳 Amount: $${customAmt}\nSelect Crypto:`, {
    reply_markup: { inline_keyboard: btns }
  });
}

// Support message
if (s.step === 'SUPPORT') {
bot.sendMessage(ADMIN_ID, `💬 *Support Message*\nFrom: ${id}\n${text}`, {
parse_mode: 'Markdown',
reply_markup: { inline_keyboard: [[{ text: "✍️ Reply", callback_data: `arep_${id}` }]] }
});
bot.sendMessage(id, "✅ Message sent to admin.");
delete sessions[id];
return;
}

// Admin reply
if (s.step === 'REPLYING' && s.target && id === ADMIN_ID) {
bot.sendMessage(s.target, `💬 *Admin Reply:*\n${text}`, { parse_mode: 'Markdown' });
bot.sendMessage(ADMIN_ID, "✅ Reply sent.");
delete sessions[id];
return;
}

// Get quantity for service
if (s.step === 'GET_QTY') {
const qty = parseInt(text);
if (isNaN(qty) || qty < s.svc.min) return bot.sendMessage(id, `❌ Minimum ${s.svc.min}. Try again.`);
sessions[id].qty = qty;
sessions[id].step = 'GET_LINK';
return bot.sendMessage(id, "🔗 Send link or username:");
}

// Get link for service
if (s.step === 'GET_LINK') {
sessions[id].link = text;
const total = (sessions[id].qty / 100) * sessions[id].svc.price;
return bot.sendMessage(id,
`📝 *Order Summary*\nService: ${sessions[id].svc.name}\nQty: ${sessions[id].qty}\nPrice: $${total.toFixed(2)}\nLink: ${text}`,
{
parse_mode: 'Markdown',
reply_markup: {
inline_keyboard: [
[{ text: "✅ Confirm & Pay", callback_data: "buy_now" }],
[{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]
]
}
}
);
}
});

// ------------------- CALLBACK HANDLER -------------------
bot.on('callback_query', (q) => {
  const id = q.message.chat.id;
  const data = q.data;

  // Always answer the callback to remove "loading" state
  bot.answerCallbackQuery(q.id);

  if (!sessions[id]) sessions[id] = {};

  // ----------------- MAIN MENU -----------------
  if (data === 'back_to_menu') return startMenu(id);

  // ----------------- DEPOSIT FLOW -----------------
  if (data === 'goto_deposit') {
    const buttons = [
      [{ text: "$10", callback_data: "amt_10" }, { text: "$20", callback_data: "amt_20" }, { text: "$50", callback_data: "amt_50" }],
      [{ text: "$100", callback_data: "amt_100" }, { text: "$150", callback_data: "amt_150" }, { text: "$200", callback_data: "amt_200" }],
      [{ text: "$300", callback_data: "amt_300" }, { text: "$500", callback_data: "amt_500" }],
      [{ text: "💰 Custom Amount", callback_data: "amt_custom" }],
      [{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]
    ];
    return bot.sendMessage(id, "💳 Select Amount:", {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  if (data === 'amt_custom') {
    sessions[id].step = 'CUSTOM_DEPOSIT';
    return bot.sendMessage(id, "💰 Enter custom amount (minimum $10):");
  }

  if (data.startsWith('amt_')) {
    const amt = parseFloat(data.split('_')[1]);
    sessions[id].depositAmount = amt;

    const btns = Object.keys(CRYPTO).map(c => [
      { text: c, callback_data: `pay_${c}` }
    ]);
    btns.push([{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]);

    return bot.sendMessage(id, `💳 Amount: $${amt}\nSelect Crypto:`, {
      reply_markup: { inline_keyboard: btns }
    });
  }

  if (data.startsWith('pay_')) {
    const coin = data.split('_')[1];
    const depId = "D" + Date.now();

    // Ensure user exists
    if (!db.users[id]) db.users[id] = { balance: 0 };

    // Create deposit
    db.deposits[depId] = {
      userId: id,
      amount: sessions[id].depositAmount,
      crypto: coin,
      status: 'pending'
    };
    saveDB(); // Save immediately

    // Send user message with "I Have Paid" button
    bot.sendMessage(
      id,
      `⚠️ *PAYMENT REQUIRED*\nAmount: $${sessions[id].depositAmount}\nCoin: ${coin}\nAddress: \`${CRYPTO[coin]}\`\nAfter payment click below.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ I Have Paid", callback_data: `paid_${depId}` }],
            [{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]
          ]
        }
      }
    );

    // Notify admin immediately
    bot.sendMessage(
      ADMIN_ID,
      `🚨 *Deposit Submitted*\nUser: ${id}\nAmount: $${sessions[id].depositAmount}\nCoin: ${coin}\nDeposit ID: ${depId}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Approve", callback_data: `appr_${depId}` }],
            [{ text: "❌ Reject", callback_data: `rej_${depId}` }]
          ]
        }
      }
    );

    // Clear depositAmount from session to avoid reuse
    delete sessions[id].depositAmount;

    return;
  }

  // User confirms payment
  if (data.startsWith('paid_')) {
    const depId = data.split('_')[1];
    const dep = db.deposits[depId];
    if (!dep) return bot.answerCallbackQuery(q.id, { text: "❌ Deposit not found.", show_alert: true });
    if (dep.userId !== id) return bot.answerCallbackQuery(q.id, { text: "❌ This is not your deposit.", show_alert: true });
    if (dep.status !== 'pending') return bot.answerCallbackQuery(q.id, { text: "⚠️ Payment already marked.", show_alert: true });

    dep.status = 'waiting_approval';
    saveDB();
    bot.answerCallbackQuery(q.id, { text: "✅ Payment marked as sent." });
    return bot.sendMessage(id, "✅ Payment marked as sent. Waiting for admin approval.");
  }

  // Admin approves deposit
  if (data.startsWith('appr_') && id === ADMIN_ID) {
    const depId = data.split('_')[1];
    const dep = db.deposits[depId];
    if (!dep || dep.status !== 'waiting_approval') return;

    if (!db.users[dep.userId]) db.users[dep.userId] = { balance: 0 };
    db.users[dep.userId].balance += dep.amount;
    dep.status = 'approved';
    saveDB();

    bot.sendMessage(
      dep.userId,
      `✅ Deposit Approved! Balance: $${db.users[dep.userId].balance.toFixed(2)}`
    );

    return bot.editMessageText("✅ Approved", {
      chat_id: id,
      message_id: q.message.message_id
    });
  }

  // Admin rejects deposit
  if (data.startsWith('rej_') && id === ADMIN_ID) {
    const depId = data.split('_')[1];
    const dep = db.deposits[depId];
    if (!dep || dep.status !== 'waiting_approval') return;

    dep.status = 'rejected';
    saveDB();

    bot.sendMessage(dep.userId, "❌ Deposit Rejected");

    return bot.editMessageText("❌ Rejected", {
      chat_id: id,
      message_id: q.message.message_id
    });
  }

  // ----------------- SERVICES FLOW -----------------
  if (data === 'goto_services') {
    const btns = Object.keys(SERVICES).map(p => [{ text: p, callback_data: `plat_${p}` }]);
    btns.push([{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]);
    return bot.sendMessage(id, "📣 Select Platform:", { reply_markup: { inline_keyboard: btns } });
  }

  if (data.startsWith('plat_')) {
    const plat = data.split('_')[1];
    sessions[id].platform = plat;
    const categories = Object.keys(SERVICES[plat]);
    if (!categories.length) return bot.sendMessage(id, "❌ No categories yet.");
    const btns = categories.map(c => [{ text: c, callback_data: `cat_${c}` }]);
    btns.push([{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]);
    return bot.sendMessage(id, "📂 Select Category:", { reply_markup: { inline_keyboard: btns } });
  }

  if (data.startsWith('cat_')) {
    const cat = data.split('_')[1];
    const plat = sessions[id].platform;
    sessions[id].category = cat;
    const list = SERVICES[plat][cat] || [];
    if (!list.length) return bot.sendMessage(id, "❌ No services yet.");
    const btns = list.map(s => [{ text: `${s.name} ($${s.price})`, callback_data: `svc_${s.id}` }]);
    btns.push([{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]);
    return bot.sendMessage(id, "🛠 Select Service:", { reply_markup: { inline_keyboard: btns } });
  }

  if (data.startsWith('svc_')) {
    const sid = data.split('_')[1];
    let svc;

    for (const plat in SERVICES) {
      for (const cat in SERVICES[plat]) {
        const found = SERVICES[plat][cat].find(s => s.id === sid);
        if (found) {
          svc = found;
          break;
        }
      }
      if (svc) break;
    }

    if (!svc) return bot.sendMessage(id, "❌ Service not found.");

    sessions[id].svc = svc;
    sessions[id].step = 'GET_QTY';

    const msgText =
`⭐ <b>${svc.name}</b>

Description:
${svc.desc}

Price per 100 units: $${svc.price}

Minimum order: ${svc.min}

━━━━━━━━━━━━━━━
Select quantity below ⬇️`;

    return bot.sendMessage(id, msgText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]
        ]
      }
    });
  }

 // ----------------- BUY NOW -----------------
if (data === 'buy_now') {
  const s = sessions[id];
  if (!s || !s.svc || !s.qty || !s.link) return bot.sendMessage(id, "❌ Session expired");

  const total = (s.qty / 100) * s.svc.price;
  if (db.users[id].balance < total) return bot.sendMessage(id, "❌ Low balance");

  db.users[id].balance -= total;
  const oid = "O" + Date.now();

  db.orders[oid] = { userId: id, svc: s.svc.name, qty: s.qty, link: s.link, total, status: "Pending" };
  saveDB();
  delete sessions[id];

  bot.sendMessage(id, `✅ Order placed! Balance: $${db.users[id].balance.toFixed(2)}`);

  bot.sendMessage(
    ADMIN_ID,
    `📦 New Order\nUser: ${id}\nService: ${s.svc.name}\nQty: ${s.qty}\nLink: ${s.link}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚙️ Processing", callback_data: `st_proc_${oid}` }],
          [{ text: "✅ Complete", callback_data: `st_comp_${oid}` }],
          [{ text: "❌ Reject", callback_data: `st_rej_${oid}` }]
        ]
      }
    }
  );
}

// ----------------- USER ORDERS -----------------
if (data === 'goto_orders') {
  const myOrders = Object.values(db.orders).filter(o => o.userId === id);
  if (!myOrders.length) return bot.sendMessage(id, "📦 No orders yet.");

  const txt = myOrders.map(o => `📦 ${o.svc} | Qty: ${o.qty} | Status: ${o.status}`).join("\n");
  return bot.sendMessage(id, txt);
}

// ----------------- ADMIN DASHBOARD -----------------
if (data === 'admin_dashboard' && id === ADMIN_ID) {
  const btns = [
    [{ text: "👥 Users", callback_data: "admin_users" }],
    [{ text: "📦 Orders", callback_data: "admin_orders" }],
    [{ text: "💳 Deposits", callback_data: "admin_deposits" }],
    [{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]
  ];
  return bot.sendMessage(id, "👑 Admin Dashboard", { reply_markup: { inline_keyboard: btns } });
}

if (data === 'admin_users' && id === ADMIN_ID) {
  let txt = "👥 Users:\n";
  for (const uid in db.users) txt += `${uid}: $${db.users[uid].balance.toFixed(2)}\n`;
  return bot.sendMessage(id, txt, { reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]] } });
}

if (data === 'admin_deposits' && id === ADMIN_ID) {
  let txt = "💳 Deposits:\n";
  for (const dId in db.deposits) {
    const dep = db.deposits[dId];
    txt += `${dId}: User ${dep.userId} | $${dep.amount} | ${dep.crypto} | ${dep.status}\n`;
  }
  return bot.sendMessage(id, txt, { reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]] } });
}

// ----------------- ADMIN ORDERS LIST -----------------
if (data === 'admin_orders' && id === ADMIN_ID) {
  const orders = Object.entries(db.orders);
  if (!orders.length) return bot.sendMessage(id, "📦 No orders yet.");

  let txt = "📦 Orders:\n";
  const keyboard = [];

  orders.forEach(([oid, order]) => {
    txt += `Order ID: ${oid}\nUser: ${order.userId}\nService: ${order.svc}\nQty: ${order.qty}\nStatus: ${order.status}\n\n`;
    keyboard.push([
      { text: "⚙️ Processing", callback_data: `st_proc_${oid}` },
      { text: "✅ Complete", callback_data: `st_comp_${oid}` },
      { text: "❌ Reject", callback_data: `st_rej_${oid}` }
    ]);
  });

  keyboard.push([{ text: "🏠 Main Menu", callback_data: "back_to_menu" }]);
  return bot.sendMessage(id, txt, { reply_markup: { inline_keyboard: keyboard } });
}

// ----------------- SUPPORT -----------------
if (data === 'goto_support') {
  sessions[id] = sessions[id] || {};
  sessions[id].step = 'SUPPORT';
  return bot.sendMessage(id, "💬 Send your message for support:");
}

if (data.startsWith('arep_') && id === ADMIN_ID) {
  const uid = data.split('_')[1];
  sessions[id] = sessions[id] || {};
  sessions[id].step = 'REPLYING';
  sessions[id].target = uid;
  return bot.sendMessage(id, "💬 Reply to user:");
}

// ----------------- ORDER STATUS UPDATE -----------------
if (data.startsWith('st_') && id === ADMIN_ID) {
  const [, status, oid] = data.split('_'); // fixed parsing
  const order = db.orders[oid];
  if (!order) return bot.answerCallbackQuery(q.id, { text: "Order not found" });

  if (status === 'proc') order.status = 'Processing';
  else if (status === 'comp') order.status = 'Completed';
  else if (status === 'rej') order.status = 'Rejected';

  saveDB();

  bot.sendMessage(order.userId, `📦 Your order *${order.svc}* is now *${order.status}*`, { parse_mode: 'Markdown' });

  bot.editMessageText(`✅ Updated: ${order.status}`, { chat_id: id, message_id: q.message.message_id });
}
});

// Start the bot
console.log("✅ Bot is running...");
bot.on('polling_error', (error) => {
  console.error("Polling error:", error);
});
