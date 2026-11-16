(() => {
  "use strict";
  const tg = window.Telegram?.WebApp;
  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat("ru-RU", {style:"currency", currency:"RUB", maximumFractionDigits:0}).format(value);
  const CART_KEY = "drinks_market_cart_v2";
  const ORDERS_KEY = "drinks_market_orders_v2";
  let PRODUCTS = Array.isArray(window.DRINKS) ? window.DRINKS : [];
  let activeCategory = "Все", searchTerm = "", cart = readJSON(CART_KEY, {}), orders = readJSON(ORDERS_KEY, []);
  let toastTimer, apiAvailable = false;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (e) { console.warn("localStorage read:", e); return fallback; }
  }
  function persist() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    } catch (e) { showToast("Не удалось сохранить данные на устройстве"); }
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function haptic(type="light") { try { tg?.HapticFeedback?.impactOccurred(type); } catch (_) {} }
  function showToast(message) {
    const el=$("toast"); el.textContent=message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2400);
  }
  function headers() {
    return {"Content-Type":"application/json", "X-Telegram-Init-Data":tg?.initData || ""};
  }
  async function loadProducts() {
    try {
      const response = await fetch("/api/products", {headers:headers()});
      if (!response.ok) throw new Error("API unavailable");
      const data = await response.json();
      if (Array.isArray(data.products) && data.products.length) {
        PRODUCTS = data.products; apiAvailable = true;
      }
    } catch (e) {
      apiAvailable = false;
      console.info("Работаем в автономном демо-режиме:", e.message);
    }
  }
  function initTelegram() {
    if (!tg) return;
    try {
      tg.ready(); tg.expand(); tg.setHeaderColor?.("secondary_bg_color"); tg.setBackgroundColor?.("bg_color");
      const user=tg.initDataUnsafe?.user;
      if (user?.first_name) $("welcomeText").textContent=`Привет, ${user.first_name}! Выбирай любимое`;
      window.telegramUser=user ? {id:user.id, username:user.username || null} : null;
      window.telegramInitData=tg.initData || "";
      tg.onEvent?.("themeChanged", applyTelegramTheme);
    } catch(e) { console.warn("Telegram WebApp init:",e); }
  }
  function applyTelegramTheme() {
    if (!tg?.themeParams) return;
    const p=tg.themeParams;
    const map={"--tg-theme-bg-color":p.bg_color,"--tg-theme-secondary-bg-color":p.secondary_bg_color,"--tg-theme-text-color":p.text_color,"--tg-theme-hint-color":p.hint_color,"--tg-theme-button-color":p.button_color,"--tg-theme-button-text-color":p.button_text_color};
    Object.entries(map).forEach(([k,v])=>{if(v)document.documentElement.style.setProperty(k,v);});
  }
  function categories() { return ["Все", ...new Set(PRODUCTS.map(p=>p.category))]; }
  function renderCategories() {
    $("categoryRow").innerHTML=categories().map(c=>`<button class="category-chip ${c===activeCategory?"active":""}" data-category="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join("");
  }
  function filteredProducts() {
    return PRODUCTS.filter(p=>(activeCategory==="Все"||p.category===activeCategory)&&`${p.name} ${p.description} ${p.category}`.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  function renderCatalog() {
    const list=filteredProducts();
    $("catalogTitle").textContent=activeCategory==="Все"?"Популярное":activeCategory;
    $("resultCount").textContent=`${list.length} поз.`;
    $("productGrid").innerHTML=list.map(p=>`
      <article class="product-card"><div class="product-image-wrap">
        <img class="product-image" src="${escapeHTML(p.image||"")}" alt="${escapeHTML(p.name)}" loading="lazy"
          onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend','<span class=&quot;product-emoji&quot;>${escapeHTML(p.emoji||"🥤")}</span>')">
      </div><div class="product-info"><h3 class="product-name">${escapeHTML(p.name)}</h3>
      <p class="product-description">${escapeHTML(p.description)}</p>
      <div class="product-meta"><strong class="product-price">${money(p.price)}</strong><span class="product-volume">${escapeHTML(p.volume)}</span></div>
      <button class="add-button" data-add="${escapeHTML(p.id)}">${cart[p.id]?`В корзине · ${cart[p.id]} шт.`:"＋ Добавить"}</button></div></article>`).join("");
    $("catalogEmpty").hidden=list.length!==0; $("productGrid").hidden=list.length===0;
  }
  function cartCount(){return Object.values(cart).reduce((s,n)=>s+Number(n||0),0);}
  function cartTotal(){return PRODUCTS.reduce((s,p)=>s+p.price*(cart[p.id]||0),0);}
  function updateBadges(){
    const n=cartCount(); $("cartBadge").textContent=n; $("tabCartBadge").textContent=n;
    $("cartBadge").hidden=n===0; $("tabCartBadge").hidden=n===0; updateMainButton();
  }
  function renderCart(){
    const items=PRODUCTS.filter(p=>cart[p.id]>0);
    $("cartItems").innerHTML=items.map(p=>`
      <article class="cart-item"><div class="cart-thumb">${p.image?`<img src="${escapeHTML(p.image)}" alt="" onerror="this.replaceWith(document.createTextNode('${escapeHTML(p.emoji||"🥤")}'))">":(p.emoji||"🥤")}</div>
      <div class="cart-item-main"><h3>${escapeHTML(p.name)}</h3><p>${money(p.price)} · ${escapeHTML(p.volume)}</p>
      <div class="quantity-control"><button data-qty="${escapeHTML(p.id)}" data-delta="-1" aria-label="Уменьшить">−</button><strong>${cart[p.id]}</strong><button data-qty="${escapeHTML(p.id)}" data-delta="1" aria-label="Увеличить">＋</button></div></div>
      <strong class="item-total">${money(p.price*cart[p.id])}</strong></article>`).join("");
    const empty=items.length===0; $("cartEmpty").hidden=!empty; $("cartSummary").hidden=empty; $("cartItems").hidden=empty;
    $("subtotal").textContent=money(cartTotal()); $("cartTotal").textContent=money(cartTotal()); $("checkoutTotal").textContent=money(cartTotal()); updateBadges();
  }
  function renderOrders(){
    $("ordersEmpty").hidden=orders.length>0;
    $("ordersList").innerHTML=orders.map(o=>`<article class="order-card"><div class="order-top"><strong>Заказ №${escapeHTML(o.id)}</strong><span class="order-status">● ${escapeHTML(o.status||"Принят")}</span></div>
      <p>${escapeHTML(o.date||"")} · ${money(o.total)}<br>${escapeHTML((o.items||[]).map(i=>`${i.name} × ${i.qty}`).join(", "))}<br>${escapeHTML(o.delivery||"")}${o.address?" · "+escapeHTML(o.address):""}</p></article>`).join("");
  }
  function switchView(id){
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===id));
    if(id==="cartView")renderCart(); if(id==="ordersView")renderOrders(); if(id==="checkoutView")$("checkoutTotal").textContent=money(cartTotal());
    haptic(); updateMainButton(); window.scrollTo({top:0,behavior:"smooth"});
  }
  function addToCart(id){
    const p=PRODUCTS.find(x=>x.id===id); if(!p)return;
    if(Number.isFinite(p.stock)&&p.stock>=0&&(cart[id]||0)>=p.stock){showToast("Больше нет в наличии");return;}
    cart[id]=(cart[id]||0)+1;persist();renderCatalog();renderCart();haptic();showToast("Добавлено в корзину");
  }
  function changeQuantity(id,delta){
    const p=PRODUCTS.find(x=>x.id===id);if(!p)return;
    const next=(cart[id]||0)+delta;
    if(next<=0)delete cart[id];else if(Number.isFinite(p.stock)&&next>p.stock){showToast("Недостаточно товара на складе");return;}else cart[id]=next;
    persist();renderCatalog();renderCart();haptic("selection");
  }
  function updateMainButton(){
    if(!tg?.MainButton)return;
    if(document.querySelector(".view.active")?.id==="cartView"&&cartCount()>0){
      tg.MainButton.setText(`Оформить · ${money(cartTotal())}`);tg.MainButton.show();
      tg.MainButton.onClick(()=>switchView("checkoutView"));
    }else tg.MainButton.hide();
  }
  function validateForm(){
    const name=$("customerName").value.trim(),phone=$("customerPhone").value.trim();
    const delivery=document.querySelector('input[name="delivery"]:checked').value,address=$("customerAddress").value.trim();
    if(name.length<2)return"Укажи имя (минимум 2 символа).";
    const digits=phone.replace(/\D/g,"");if(digits.length<10||digits.length>15)return"Проверь номер телефона.";
    if(delivery==="Доставка"&&address.length<5)return"Для доставки укажи адрес (минимум 5 символов).";
    if(!cartCount())return"Корзина пуста.";return"";
  }
  async function submitOrder(event){
    event.preventDefault();const error=validateForm();$("formError").hidden=!error;$("formError").textContent=error;if(error){haptic("notification");return;}
    const delivery=document.querySelector('input[name="delivery"]:checked').value;
    const payload={customer:{name:$("customerName").value.trim(),phone:$("customerPhone").value.trim()},delivery,address:$("customerAddress").value.trim(),items:PRODUCTS.filter(p=>cart[p.id]>0).map(p=>({id:p.id,qty:cart[p.id]}))};
    const button=$("submitOrder");button.disabled=true;button.textContent="Отправляем…";
    try{
      let order;
      if(apiAvailable){
        const response=await fetch("/api/orders",{method:"POST",headers:headers(),body:JSON.stringify(payload)});
        const result=await response.json();if(!response.ok)throw new Error(result.error||"Не удалось оформить заказ");
        order=result.order;
      }else{
        order={id:String(Date.now()).slice(-7),date:new Date().toLocaleString("ru-RU"),total:cartTotal(),delivery,address:payload.address,items:PRODUCTS.filter(p=>cart[p.id]>0).map(p=>({name:p.name,qty:cart[p.id]})),status:"Демо"};
      }
      orders.unshift(order);orders=orders.slice(0,30);cart={};persist();renderCart();renderCatalog();renderOrders();$("checkoutForm").reset();$("formError").hidden=true;
      showToast(apiAvailable?"Заказ отправлен!":"Демо-заказ сохранён на устройстве");haptic("notification");switchView("ordersView");
    }catch(e){$("formError").textContent=e.message||"Ошибка отправки. Попробуй ещё раз.";$("formError").hidden=false;}
    finally{button.disabled=false;button.innerHTML='Подтвердить заказ <span>→</span>';}
  }
  $("categoryRow").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;activeCategory=b.dataset.category;renderCategories();renderCatalog();haptic("selection");});
  $("productGrid").addEventListener("click",e=>{const b=e.target.closest("[data-add]");if(b)addToCart(b.dataset.add);});
  $("cartItems").addEventListener("click",e=>{const b=e.target.closest("[data-qty]");if(b)changeQuantity(b.dataset.qty,Number(b.dataset.delta));});
  $("searchInput").addEventListener("input",e=>{searchTerm=e.target.value.trim();$("clearSearch").hidden=!searchTerm;renderCatalog();});
  $("clearSearch").addEventListener("click",()=>{$("searchInput").value="";searchTerm="";$("clearSearch").hidden=true;renderCatalog();});
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>switchView(t.dataset.view)));
  $("cartShortcut").addEventListener("click",()=>switchView("cartView"));
  $("goCatalog").addEventListener("click",()=>switchView("catalogView"));
  $("checkoutButton").addEventListener("click",()=>switchView("checkoutView"));
  $("backToCart").addEventListener("click",()=>switchView("cartView"));
  $("checkoutForm").addEventListener("submit",submitOrder);
  document.querySelectorAll('input[name="delivery"]').forEach(i=>i.addEventListener("change",()=>{$("customerAddress").placeholder=i.value==="Доставка"?"Улица, дом, подъезд, квартира":"Необязательно: комментарий к самовывозу";}));
  async function start(){
    initTelegram();applyTelegramTheme();
    await loadProducts();
    renderCategories();renderCatalog();renderCart();renderOrders();updateBadges();
  }
  start();
})();
