/* CART STORAGE */

function getCart(){
return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart){
localStorage.setItem("cart",JSON.stringify(cart));
}

let cart = getCart();


/* ADD TO CART */

document.addEventListener("DOMContentLoaded",()=>{

document.querySelectorAll(".add-cart").forEach(btn=>{

btn.addEventListener("click",()=>{

const card = btn.closest(".product-card");

const product = {

id: card.dataset.id,
name: card.dataset.name,
price: parseFloat(card.dataset.price),
img: card.dataset.img,
qty:1

};

addToCart(product);

});

});

updateCartBadge();

});


/* ADD FUNCTION */

function addToCart(product){

cart = getCart();

const exist = cart.find(p=>p.id === product.id);

if(exist){

exist.qty++;

}else{

cart.push(product);

}

saveCart(cart);

updateCartBadge();

}


/* CART BADGE */

function updateCartBadge(){

cart = getCart();

const badge = document.querySelector(".cart-count");

if(!badge) return;

const total = cart.reduce((sum,item)=>sum+item.qty,0);

badge.innerText = total;

}


/* TAX + SHIPPING */

const TAX_RATE = 0.08;
const SHIPPING_THRESHOLD = 100;
const SHIPPING_COST = 10;


/* TOTAL */

function updateTotal(){

cart = getCart();

const subtotalPrice = document.querySelector(".subtotal-price");
const totalPrice = document.querySelector(".total-price");
const subtotalItems = document.querySelector(".subtotal-items");
const cartTitle = document.querySelector(".cart-page h1");

if(!subtotalPrice) return;

let subtotal=0;
let count=0;

cart.forEach(p=>{
subtotal += p.price*p.qty;
count += p.qty;
});

let tax = subtotal * TAX_RATE;

let shipping = subtotal>SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;

let total = subtotal + tax + shipping;

subtotalPrice.innerText="$"+subtotal.toFixed(2);
totalPrice.innerText="$"+total.toFixed(2);

const taxEl=document.querySelector(".tax");
const shipEl=document.querySelector(".shipping");

if(taxEl) taxEl.innerText="$"+tax.toFixed(2);
if(shipEl) shipEl.innerText=shipping===0?"FREE":"$"+shipping;

if(subtotalItems)
subtotalItems.innerText="Subtotal ("+count+" items)";

if(cartTitle)
cartTitle.innerText="My Bag ("+count+")";

}


/* TAB SYNC */

window.addEventListener("storage",(e)=>{

if(e.key==="cart"){

updateCartBadge();

updateTotal();

}

});