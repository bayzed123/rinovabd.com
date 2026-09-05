// Every icon rendered after the page has loaded must actually draw.
import { chromium } from 'playwright';
import { BASE, launchOptions } from '../harness.mjs';

const results=[];
const check=(n,p,d='')=>{results.push(p);console.log(`${p?'PASS':'FAIL'} · ${n}${d?` — ${d}`:''}`)};
const b=await chromium.launch(launchOptions());
const c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true});
await c.addInitScript(()=>{try{localStorage.setItem('rinova-analytics-consent','denied')}catch{}});
const p=await c.newPage();

// The checkout basket is drawn from localStorage after load, so its steppers are the case that
// broke: the decrease button was an empty box on every order.
const prods=await (await fetch(`${BASE}/api/products`)).json();
const list=(prods.products||prods).slice(0,2);
await p.goto(`${BASE}/checkout.html`,{waitUntil:'networkidle'});
await p.evaluate((items)=>localStorage.setItem('rinova-bag',JSON.stringify(items.map(x=>({id:x.id,sku:x.sku,slug:x.slug,name:x.name,price:x.salePrice??x.price,quantity:2,stock:x.stock,minOrderQty:1})))),list);
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const empty=await p.evaluate(()=>[...document.querySelectorAll('[data-rinova-icon]')].filter(n=>!n.querySelector('svg')).map(n=>n.dataset.rinovaIcon));
check('No icon on the checkout page is left empty',empty.length===0,empty.join(', '));
const minus=await p.evaluate(()=>{
  const n=document.querySelector('[data-checkout-qty][data-direction="-1"]');
  const svg=n?.querySelector('svg');
  return {found:Boolean(n),glyph:(n?.textContent||'').trim(),drawnAsSvg:Boolean(svg)};
});
check('The decrease-quantity button is readable without an icon',minus.found&&Boolean(minus.glyph)&&!minus.drawnAsSvg,JSON.stringify(minus));

// The blog pager and the account panels use the same late-rendered markup.
await p.goto(`${BASE}/blog.html`,{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const blogEmpty=await p.evaluate(()=>[...document.querySelectorAll('[data-rinova-icon]')].filter(n=>!n.querySelector('svg')).map(n=>n.dataset.rinovaIcon));
check('No icon on the journal is left empty',blogEmpty.length===0,blogEmpty.join(', '));

await p.goto(`${BASE}/account.html`,{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const accountEmpty=await p.evaluate(()=>[...document.querySelectorAll('[data-rinova-icon]')].filter(n=>!n.querySelector('svg')).map(n=>n.dataset.rinovaIcon));
check('No icon on the account page is left empty',accountEmpty.length===0,accountEmpty.join(', '));

// And the icons that were already there at load must not be redrawn into nothing.
await p.goto(`${BASE}/`,{waitUntil:'networkidle'});
await p.waitForTimeout(1000);
const home=await p.evaluate(()=>{
  const nodes=[...document.querySelectorAll('[data-rinova-icon]')];
  return {total:nodes.length,empty:nodes.filter(n=>!n.querySelector('svg')).length};
});
check('The home page still draws every icon exactly once',home.total>0&&home.empty===0,JSON.stringify(home));
const doubled=await p.evaluate(()=>[...document.querySelectorAll('[data-rinova-icon]')].filter(n=>n.querySelectorAll('svg').length>1).length);
check('No icon is drawn twice',doubled===0,`${doubled} doubled`);

await b.close();
const passed=results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed===results.length?0:1);
