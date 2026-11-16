(() => {
  const $=id=>document.getElementById(id);
  let token=sessionStorage.getItem("drinks_admin_token")||"";
  let products=[];
  const auth=()=>({ "Content-Type":"application/json","Authorization":`Bearer ${token}` });
  const money=n=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(n);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let toastTimer;
  function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2200);}
  async function api(url,options={}){const r=await fetch(url,{...options,headers:{...auth(),...(options.headers||{})}});let d={};try{d=await r.json()}catch(_){}if(!r.ok)throw new Error(d.error||"Ошибка запроса");return d;}
  function showDashboard(){ $("loginPanel").hidden=true;$("dashboard").hidden=false;loadProducts().catch(e=>toast(e.message));loadOrders().catch(e=>toast(e.message));}
  async function login(e){e.preventDefault();token=$("tokenInput").value.trim();try{await api("/api/admin/products");sessionStorage.setItem("drinks_admin_token",token);$("loginError").textContent="";showDashboard();}catch(err){$("loginError").textContent=err.message;}}
  function renderProducts(){
    $("productList").innerHTML=products.map(p=>`<article class="product-row"><div class="product-main"><div class="thumb">${p.image?`<img src="${esc(p.image)}" onerror="this.replaceWith(document.createTextNode('${esc(p.emoji)}'))">`:esc(p.emoji)}</div><div><h3>${esc(p.name)} ${p.active?"":"(скрыт)"}</h3><p>${money(p.price)} · ${esc(p.volume)} · Остаток: ${p.stock}<br>${esc(p.description)}</p></div></div><div class="row-actions"><button data-edit="${esc(p.id)}">Изменить</button><button class="danger" data-delete="${esc(p.id)}">Скрыть</button></div></article>`).join("")||"<p class='muted'>Товаров пока нет.</p>";
  }
  async function loadProducts(){const d=await api("/api/admin/products");products=d.products;renderProducts();}
  async function loadOrders(){
    const d=await api("/api/admin/orders");
    $("orderList").innerHTML=d.orders.map(o=>`<article class="order-card"><div class="order-head"><strong>Заказ №${o.id} · ${esc(o.date)}</strong><span class="order-total">${money(o.total)}</span></div><p><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}<br>${esc(o.delivery)} ${esc(o.address||"")}<br>${o.items.map(i=>`${esc(i.name)} × ${i.qty}`).join(", ")}</p><div class="order-actions"><label class="muted">Статус</label><select data-status="${o.id}">${["Новый","Подтверждён","Готовится","Выполнен","Отменён"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select><button class="secondary" data-save-status="${o.id}">Сохранить</button></div></article>`).join("")||"<p class='muted'>Заказов пока нет.</p>";
  }
  function resetEditor(){ $("productForm").reset();$("pId").value="";$("pCategory").value="Газировка";$("pEmoji").value="🥤";$("pStock").value="999";$("pActive").checked=true;$("editorTitle").textContent="Новый товар";$("productError").textContent=""; }
  function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;$("pId").value=p.id;$("pName").value=p.name;$("pCategory").value=p.category;$("pPrice").value=p.price;$("pVolume").value=p.volume;$("pEmoji").value=p.emoji;$("pStock").value=p.stock;$("pDescription").value=p.description;$("pImage").value=p.image;$("pActive").checked=!!p.active;$("editorTitle").textContent="Изменить товар";$("productForm").hidden=false;window.scrollTo({top:0,behavior:"smooth"});}
  async function saveProduct(e){
    e.preventDefault();const id=$("pId").value;
    const p={name:$("pName").value.trim(),category:$("pCategory").value.trim(),price:Number($("pPrice").value),volume:$("pVolume").value.trim(),emoji:$("pEmoji").value.trim()||"🥤",stock:Number($("pStock").value),description:$("pDescription").value.trim(),image:$("pImage").value.trim(),active:$("pActive").checked};
    try{await api(id?`/api/admin/products/${encodeURIComponent(id)}`:"/api/admin/products",{method:id?"PUT":"POST",body:JSON.stringify(id?p:{...p,id:undefined})});$("productForm").hidden=true;resetEditor();await loadProducts();toast("Товар сохранён");}catch(err){$("productError").textContent=err.message;}
  }
  $("loginForm").addEventListener("submit",login);
  $("newProduct").addEventListener("click",()=>{resetEditor();$("productForm").hidden=false;});
  $("cancelEdit").addEventListener("click",()=>{$("productForm").hidden=true;resetEditor();});
  $("productForm").addEventListener("submit",saveProduct);
  $("productList").addEventListener("click",async e=>{
    const edit=e.target.closest("[data-edit]");if(edit)return editProduct(edit.dataset.edit);
    const del=e.target.closest("[data-delete]");if(del&&confirm("Скрыть товар из каталога?")){try{await api(`/api/admin/products/${encodeURIComponent(del.dataset.delete)}`,{method:"DELETE"});await loadProducts();toast("Товар скрыт");}catch(err){toast(err.message);}}
  });
  $("orderList").addEventListener("click",async e=>{const b=e.target.closest("[data-save-status]");if(!b)return;const id=b.dataset.saveStatus;const status=document.querySelector(`[data-status="${id}"]`).value;try{await api(`/api/admin/orders/${id}`,{method:"PATCH",body:JSON.stringify({status})});toast("Статус обновлён");}catch(err){toast(err.message);}});
  $("refreshOrders").addEventListener("click",()=>loadOrders().catch(e=>toast(e.message)));
  document.querySelectorAll(".admin-tabs button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".admin-tabs button").forEach(x=>x.classList.toggle("active",x===b));$("productsTab").hidden=b.dataset.tab!=="products";$("ordersTab").hidden=b.dataset.tab!=="orders";}));
  if(token){$("tokenInput").value=token;showDashboard();}
})();
