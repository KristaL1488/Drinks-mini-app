const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const REQUIRE_TELEGRAM_AUTH = process.env.REQUIRE_TELEGRAM_AUTH === "true";
const db = new Database(process.env.DB_PATH || path.join(__dirname, "shop.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
  volume TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🥤',
  image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  stock INTEGER NOT NULL DEFAULT 999
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
  customer_name TEXT NOT NULL, phone TEXT NOT NULL, delivery TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Новый', items_json TEXT NOT NULL,
  telegram_user_id TEXT
);
`);

const seedProducts = [
  ["cola-classic","Кола классическая","Знакомый карамельный вкус","Газировка",119,"0,5 л","🥤","https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=700&auto=format&fit=crop",1,999],
  ["cola-zero","Кола без сахара","Классический вкус без сахара","Газировка",119,"0,5 л","🖤","https://images.unsplash.com/photo-1554866585-cd94860890b7?w=700&auto=format&fit=crop",1,999],
  ["orange-soda","Апельсиновая газировка","Яркий цитрусовый вкус","Газировка",109,"0,5 л","🍊","https://images.unsplash.com/photo-1544145945-f90425340c7e?w=700&auto=format&fit=crop",1,999],
  ["lemon-lime","Лимон-лайм","Освежающее сочетание лимона и лайма","Газировка",109,"0,5 л","🍋","https://images.unsplash.com/photo-1513558161293-cdad765edc13?w=700&auto=format&fit=crop",1,999],
  ["grape-soda","Виноградная газировка","Сладкий фруктовый вкус","Газировка",129,"0,5 л","🍇","https://images.unsplash.com/photo-1532634896-26909d0d4b5b?w=700&auto=format&fit=crop",1,999],
  ["ginger-ale","Имбирный эль","Лёгкая пряная нотка и пузырьки","Газировка",139,"0,33 л","🫚","https://images.unsplash.com/photo-1513558161293-cdad765edc13?w=700&auto=format&fit=crop",1,999],
  ["tonic","Тоник","Освежающий напиток с лёгкой горчинкой","Газировка",129,"0,33 л","🫧","https://images.unsplash.com/photo-1544145945-f90425340c7e?w=700&auto=format&fit=crop",1,999],
  ["berry-soda","Ягодная газировка","Микс ягод с приятной газированностью","Газировка",119,"0,5 л","🫐","https://images.unsplash.com/photo-1513558161293-cdad765edc13?w=700&auto=format&fit=crop",1,999]
];
const insertProduct = db.prepare(`INSERT OR IGNORE INTO products
(id,name,description,category,price,volume,emoji,image,active,stock) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (!count) db.transaction(() => seedProducts.forEach(p => insertProduct.run(...p)))();

app.use(express.json({limit:"200kb"}));
app.use(express.static(__dirname, { extensions:["html"] }));

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN) return { ok: !REQUIRE_TELEGRAM_AUTH, user: null, reason: "BOT_TOKEN not configured" };
  if (!initData || typeof initData !== "string") return { ok: !REQUIRE_TELEGRAM_AUTH, user: null, reason: "Missing initData" };
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return {ok:false, user:null};
    params.delete("hash");
    const dataCheckString = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const a = Buffer.from(calculated, "hex"), b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return {ok:false,user:null};
    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate || Date.now()/1000 - authDate > 86400) return {ok:false,user:null,reason:"Expired initData"};
    let user = null;
    try { user = JSON.parse(params.get("user") || "null"); } catch (_) {}
    return {ok:true,user};
  } catch (_) { return {ok:false,user:null}; }
}
function telegramAuth(req,res,next) {
  const result = validateTelegramInitData(req.get("X-Telegram-Init-Data") || "");
  if (!result.ok) return res.status(401).json({error:"Открой приложение через Telegram и попробуй ещё раз."});
  req.telegramUser = result.user; next();
}
function adminAuth(req,res,next) {
  const token = (req.get("Authorization") || "").replace(/^Bearer\s+/i,"");
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res.status(401).json({error:"Неверный токен администратора."});
  next();
}
function publicProduct(row) {
  return {id:row.id,name:row.name,description:row.description,category:row.category,price:row.price,volume:row.volume,emoji:row.emoji,image:row.image,stock:row.stock};
}
async function notifyAdmin(order) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return;
  const lines = order.items.map(i=>`• ${i.name} × ${i.qty} — ${i.lineTotal} ₽`).join("\n");
  const text = `🛒 Новый заказ №${order.id}\n${lines}\n\nИтого: ${order.total} ₽\nПолучение: ${order.delivery}\nАдрес: ${order.address || "не указан"}\nИмя: ${order.customer.name}\nТелефон: ${order.customer.phone}`;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:ADMIN_CHAT_ID,text})
    });
  } catch (e) { console.error("Telegram notification failed:",e.message); }
}

app.get("/api/health",(req,res)=>res.json({ok:true}));
app.get("/api/products",(req,res)=>{
  const rows=db.prepare("SELECT * FROM products WHERE active=1 ORDER BY name").all();
  res.json({products:rows.map(publicProduct)});
});
app.post("/api/orders",telegramAuth,async(req,res)=>{
  try {
    const {customer,delivery,address="",items}=req.body||{};
    if(!customer||typeof customer.name!=="string"||customer.name.trim().length<2) return res.status(400).json({error:"Проверь имя."});
    const digits=String(customer.phone||"").replace(/\D/g,"");
    if(digits.length<10||digits.length>15) return res.status(400).json({error:"Проверь номер телефона."});
    if(!["Самовывоз","Доставка"].includes(delivery)) return res.status(400).json({error:"Выбери способ получения."});
    if(delivery==="Доставка"&&String(address).trim().length<5) return res.status(400).json({error:"Укажи адрес доставки."});
    if(!Array.isArray(items)||!items.length||items.length>30) return res.status(400).json({error:"Корзина пуста или содержит слишком много позиций."});
    const getProduct=db.prepare("SELECT * FROM products WHERE id=? AND active=1");
    const normalized=[];let total=0;
    for(const item of items){
      const p=getProduct.get(String(item.id));const qty=Number(item.qty);
      if(!p||!Number.isInteger(qty)||qty<1||qty>30) return res.status(400).json({error:"Один из товаров недоступен. Обнови каталог."});
      if(p.stock<qty) return res.status(409).json({error:`Недостаточно товара «${p.name}» на складе.`});
      normalized.push({id:p.id,name:p.name,qty,price:p.price,lineTotal:p.price*qty});total+=p.price*qty;
    }
    const create=db.prepare(`INSERT INTO orders(created_at,customer_name,phone,delivery,address,total,items_json,telegram_user_id)
      VALUES(?,?,?,?,?,?,?,?)`);
    const updateStock=db.prepare("UPDATE products SET stock=stock-? WHERE id=?");
    const transaction=db.transaction(()=>{
      const result=create.run(new Date().toISOString(),customer.name.trim(),String(customer.phone).trim(),delivery,String(address).trim(),total,JSON.stringify(normalized),req.telegramUser?.id?String(req.telegramUser.id):null);
      normalized.forEach(i=>updateStock.run(i.qty,i.id));
      return Number(result.lastInsertRowid);
    });
    const id=transaction();
    const order={id,date:new Date().toLocaleString("ru-RU"),total,delivery,address:String(address).trim(),customer:{name:customer.name.trim(),phone:String(customer.phone).trim()},items:normalized,status:"Новый"};
    await notifyAdmin(order);
    res.status(201).json({order});
  }catch(e){console.error(e);res.status(500).json({error:"Внутренняя ошибка. Попробуй позже."});}
});

app.get("/api/admin/products",adminAuth,(req,res)=>{
  res.json({products:db.prepare("SELECT * FROM products ORDER BY name").all()});
});
app.post("/api/admin/products",adminAuth,(req,res)=>{
  const p=req.body||{};
  if(!p.name||String(p.name).trim().length<2||!Number.isFinite(Number(p.price))||Number(p.price)<0||!p.volume) return res.status(400).json({error:"Заполни название, цену и объём."});
  const id=String(p.id||crypto.randomUUID()).toLowerCase().replace(/[^a-z0-9_-]/g,"-");
  try{
    db.prepare(`INSERT INTO products(id,name,description,category,price,volume,emoji,image,active,stock) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(id,String(p.name).trim(),String(p.description||""),String(p.category||"Газировка"),Math.round(Number(p.price)),String(p.volume),String(p.emoji||"🥤"),String(p.image||""),p.active===false?0:1,Math.max(0,Math.floor(Number(p.stock??999))));
    res.status(201).json({product:db.prepare("SELECT * FROM products WHERE id=?").get(id)});
  }catch(e){res.status(409).json({error:"Не удалось добавить товар. Возможно, такой ID уже существует."});}
});
app.put("/api/admin/products/:id",adminAuth,(req,res)=>{
  const p=req.body||{};
  if(!p.name||!Number.isFinite(Number(p.price))||Number(p.price)<0||!p.volume) return res.status(400).json({error:"Проверь название, цену и объём."});
  const result=db.prepare(`UPDATE products SET name=?,description=?,category=?,price=?,volume=?,emoji=?,image=?,active=?,stock=? WHERE id=?`)
    .run(String(p.name).trim(),String(p.description||""),String(p.category||"Газировка"),Math.round(Number(p.price)),String(p.volume),String(p.emoji||"🥤"),String(p.image||""),p.active===false?0:1,Math.max(0,Math.floor(Number(p.stock??999))),req.params.id);
  if(!result.changes)return res.status(404).json({error:"Товар не найден."});
  res.json({product:db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id)});
});
app.delete("/api/admin/products/:id",adminAuth,(req,res)=>{
  const result=db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);
  if(!result.changes)return res.status(404).json({error:"Товар не найден."});
  res.json({ok:true});
});
app.get("/api/admin/orders",adminAuth,(req,res)=>{
  const rows=db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all();
  res.json({orders:rows.map(r=>({id:r.id,date:r.created_at,customer:{name:r.customer_name,phone:r.phone},delivery:r.delivery,address:r.address,total:r.total,status:r.status,items:JSON.parse(r.items_json)}))});
});
app.patch("/api/admin/orders/:id",adminAuth,(req,res)=>{
  const allowed=["Новый","Подтверждён","Готовится","Выполнен","Отменён"];
  if(!allowed.includes(req.body?.status))return res.status(400).json({error:"Недопустимый статус."});
  const result=db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);
  if(!result.changes)return res.status(404).json({error:"Заказ не найден."});
  res.json({ok:true});
});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.listen(PORT,()=>console.log(`Drinks Mini App listening on :${PORT}`));
