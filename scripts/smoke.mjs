// End-to-end smoke test: builds must already exist in dist/ (`pnpm build`).
// Serves dist/, boots the game in headless Chromium, enters the city, walks, jumps,
// checks pause/settings and a mobile HUD, and fails on console/network errors.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)
function cleanup(){ clearTimeout(guard); try{server.kill('SIGTERM')}catch{} }
async function fail(msg){ console.error(`smoke: FAIL — ${msg}`); await browser?.close().catch(()=>{}); cleanup(); process.exit(1) }
async function waitForServer(){ for(let i=0;i<60;i+=1){ try{if((await fetch(url)).ok)return}catch{} await new Promise(r=>setTimeout(r,250)) } throw new Error('preview server did not start') }
async function openGame(context, errors){
  const page=await context.newPage()
  page.on('console',m=>m.type()==='error'&&errors.push(m.text()))
  page.on('pageerror',e=>errors.push(String(e)))
  page.on('response',r=>r.status()>=400&&errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active',{timeout:30_000})
  await page.evaluate(async()=>{await document.fonts.ready; const family=getComputedStyle(document.querySelector('.logo-text')).fontFamily; if(!family.includes('ManusCC0')) throw new Error(`unexpected font ${family}`)})
  await page.waitForTimeout(700)
  return page
}
const state=page=>page.evaluate(()=>{const {game}=window.__game; const p=game['player'].root.position; return {mode:game.mode,run:game.run,pos:{x:p.x,y:p.y,z:p.z}}})
try{
  await waitForServer()
  browser=await chromium.launch({args:['--ignore-gpu-blocklist']}).catch(()=>chromium.launch({args:['--ignore-gpu-blocklist'],executablePath:'/usr/bin/chromium'}))
  const errors=[]
  const en=await browser.newContext({viewport:{width:1280,height:720},locale:'en-US'})
  const page=await openGame(en,errors)
  await page.screenshot({path:`${out}/01-title-en.png`})
  await page.click('[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.keyboard.press('KeyE'); await page.waitForTimeout(180)
  if(await page.locator('[data-slot="vehicle"]').textContent()!=='DRIVING') throw new Error('vehicle entry did not activate')
  await page.keyboard.press('KeyE'); await page.waitForTimeout(180)
  if(await page.locator('[data-slot="vehicle"]').textContent()!=='ON FOOT') throw new Error('vehicle exit did not restore on-foot mode')
  const before=await state(page)
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.press('Space'); await page.waitForTimeout(900); await page.keyboard.up('KeyW'); await page.waitForTimeout(500)
  await page.screenshot({path:`${out}/02-city-roam.png`})
  const after=await state(page); const moved=Math.hypot(after.pos.x-before.pos.x,after.pos.z-before.pos.z)
  if(after.mode!=='playing') throw new Error(`expected playing, got ${after.mode}`)
  if(!(after.run.timeLeft<before.run.timeLeft)) throw new Error('clock did not run')
  if(moved<2) throw new Error(`player barely moved (${moved.toFixed(2)} m)`)
  await page.keyboard.press('Escape'); await page.waitForSelector('[data-screen="pause"].is-active'); await page.screenshot({path:`${out}/03-pause.png`})
  await page.click('[data-screen="pause"] [data-action="settings"]'); await page.waitForSelector('[data-screen="settings"].is-active'); await page.screenshot({path:`${out}/04-settings.png`})
  await page.keyboard.press('Escape'); await page.waitForSelector('[data-screen="pause"].is-active'); if((await state(page)).mode!=='paused') throw new Error('leaving settings resumed the run')
  await page.click('[data-screen="pause"] [data-action="resume"]'); await page.waitForSelector('[data-screen="hud"].is-active'); await en.close()
  const phone=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-CN'})
  const phonePage=await openGame(phone,errors); await phonePage.tap('[data-action="play"]'); await phonePage.waitForSelector('[data-screen="hud"].is-active'); await phonePage.waitForTimeout(800); await phonePage.screenshot({path:`${out}/05-phone-hud.png`}); await phone.close()
  if(errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close(); cleanup(); console.log(`smoke: OK — moved ${moved.toFixed(1)} m, screenshots in ${out}/`)
}catch(err){ await fail(err?.message??String(err)) }
