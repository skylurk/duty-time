import { test, expect, type Page } from '@playwright/test';
import { dateKey, DAY_MS, parseTime, type DutyData } from '../lib/duty';
const today=dateKey(),month=today.slice(0,7);
const profile={uid:'test-member',company:'test-company',firstName:'Test',lastName:'Member',name:'Test Member',email:'test@example.com',department:'Operations',position:'Engineer',photo:'',isLineManager:false,lineManagerUids:[],enabled:true};
async function mockAccount(page:Page,admin=false,activeStart?:number) {
 if(activeStart===undefined)await page.clock.setSystemTime(new Date(parseTime(today,'12:00')));
 const payload=Buffer.from(JSON.stringify({sub:profile.uid,user_id:profile.uid,email:profile.email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,aud:'mock',iss:'https://securetoken.google.com/mock'})).toString('base64url');
 const token=`e30.${payload}.signature`;
 await page.route('**/identitytoolkit.googleapis.com/**',route=>route.fulfill({json:route.request().url().includes('lookup')?{users:[{localId:profile.uid,email:profile.email,emailVerified:true}]}:{localId:profile.uid,email:profile.email,idToken:token,refreshToken:'test-refresh',expiresIn:'3600'}}));
 await page.route('**/securetoken.googleapis.com/**',route=>route.fulfill({json:{access_token:token,refresh_token:'test-refresh',expires_in:'3600',user_id:profile.uid,token_type:'Bearer',id_token:token}}));
 const data:DutyData={profile,isAdmin:admin,month,todayDay:null,managers:[],stations:[{id:'wilson',name:'Wilson Airport',active:true,source:'shared'}],days:[],active:null,settings:{allowManualTimes:false},companyName:'Kasas Limited',team:[],reportDeliveryReady:true,reporting:{queued:0,blocked:0,failed:0}};
 if(activeStart!==undefined)data.active={id:'saved-open-session',date:dateKey(activeStart),start:activeStart,stationId:'wilson',station:'Wilson Airport',notes:''};
 await page.route('**/api/duty?*',route=>route.fulfill({json:{...data,month:new URL(route.request().url()).searchParams.get('month')||data.month,audit:[]}}));
 await page.route('**/api/duty',async route=>{const body=route.request().postDataJSON();if(body.action==='checkin')data.active={id:'test-session',date:today,start:Date.now()-1000,stationId:'wilson',station:'Wilson Airport',notes:''};else if(body.action==='actualCheckout'){data.days=data.days.map(d=>({...d,status:'recorded',revision:d.revision+1,sessions:d.sessions.map(s=>({...s,end:parseTime(body.endDate,body.end),autoCheckoutPending:false}))}));data.pendingAutoCheckouts=[];}else if(body.action==='checkout'){data.todayDay={id:'day',uid:profile.uid,company:profile.company,date:today,status:'recorded',reason:'',closed:false,audit:[],revision:1,sessions:[{id:'session',start:data.active!.start,end:Date.now(),stationId:'wilson',station:'Wilson Airport',notes:''}]};data.days=[data.todayDay];data.active=null;}await route.fulfill({json:{message:body.action==='checkin'?'Checked in':'Checked out',delivery:[]}});});
 await page.route('**/api/admin',route=>route.fulfill({json:{users:[profile],stations:data.stations,settings:data.settings,positions:['Engineer'],reports:[],reportDeliveryReady:true}}));
 await page.goto('/');
 await page.getByLabel('Email address').fill(profile.email);
 await page.getByLabel('Password',{exact:true}).fill('test-password-only');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'A good day starts here.'})).toBeVisible();
 return data;
}
test('production API rejects unauthenticated reads and writes',async({request})=>{
 for(const path of ['/api/duty','/api/admin','/api/station-contacts']){expect((await request.get(path)).status()).toBe(401);expect((await request.post(path,{data:{action:'settings'}})).status()).toBe(401);}
 expect((await request.post('/api/reports/retry',{data:{id:'fake'}})).status()).toBe(401);
});
test('desktop sign-in renders brand and validates empty inputs',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 const logo=page.getByAltText('Kasas Limited');await expect(logo).toBeVisible();
 await expect.poll(()=>logo.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByLabel('Email address')).toBeFocused();
 await page.screenshot({path:'/private/tmp/duty-time-login-desktop.png',fullPage:true});
});
test('mobile member can check in, check out, and review calendar details',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockAccount(page);
 await expect(page.getByRole('button',{name:'Admin',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'My line duty',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Check in',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check out',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Check out',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Duty complete'})).toBeVisible();
 await page.getByRole('button',{name:'Back to my day'}).click();
 await page.getByRole('button',{name:new RegExp(`^${today}, recorded`)}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:'/private/tmp/duty-time-dashboard-mobile.png',fullPage:true});
});
test('administrator can open user management and its searchable manager picker',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await mockAccount(page,true);
 await page.getByRole('button',{name:'Admin',exact:true}).click();
 await expect(page.getByRole('heading',{name:'People & permissions'})).toBeVisible();
 await page.getByRole('button',{name:'Add user',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Add user'})).toBeVisible();
 await expect(page.getByLabel('This user is a line manager')).not.toBeChecked();
 await expect(page.getByPlaceholder('Search line managers…')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an existing open shift resumes from check-in and keeps counting after reload',async({page})=>{
 const now=Date.now();
 await page.clock.install({time:new Date(now)});
 await page.clock.pauseAt(new Date(now+1000));
 const openedAt=now+1000-50*3600000;
 await mockAccount(page,false,openedAt);
 const timer=page.getByLabel('Current session elapsed time',{exact:true});
 await expect(timer).toHaveText('50:00:00');
 await page.clock.runFor(5000);
 await expect(timer).toHaveText('50:00:05');
 await page.reload();
 await expect(timer).toHaveText('50:00:05');
 // Catch up on return without waiting for an interval tick or server refresh.
 await page.clock.setSystemTime(new Date(now+1000+65000));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(timer).toHaveText('50:01:05');
});

test('user can resolve a system checkout and clear its pending label',async({page})=>{
 const data=await mockAccount(page);
 const date=dateKey(Date.now()-DAY_MS),group='test-member_open';
 data.days=[{id:'pending-day',uid:profile.uid,company:profile.company,date,status:'pending_checkout',reason:'',closed:false,audit:[],revision:1,sessions:[{id:'auto-session',start:parseTime(date,'08:00'),end:parseTime(date,'19:00'),stationId:'wilson',station:'Wilson Airport',notes:'',autoCheckoutId:group,autoCheckoutPending:true}]}];
 data.pendingAutoCheckouts=[{id:group,date,cutoffAt:parseTime(date,'19:00')}];
 await page.reload();
 await page.getByRole('button',{name:`Review ${date}`}).click();
 await page.getByRole('button',{name:'Set actual checkout'}).click();
 await page.getByLabel('Actual finish time (Africa/Nairobi)').fill('17:00');
 await page.getByLabel('Reason / explanation').fill('Finished at five and forgot to check out.');
 await page.getByRole('button',{name:'Confirm actual checkout'}).click();
 await expect(page.getByRole('button',{name:'Set actual checkout'})).toHaveCount(0);
 await expect(page.getByText('9h 0m recorded duty time')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:`Review ${date}`})).toHaveCount(0);
});
test('administrator can set a team member cutoff from the team calendar',async({page})=>{
 const data=await mockAccount(page,true);
 data.team=[{...profile,uid:'team-member',name:'Team Colleague',firstName:'Team',lineManagerUids:[profile.uid]}];
 let saved:unknown;
 await page.route('**/api/cutoff',async route=>{saved=route.request().postDataJSON();await route.fulfill({json:{message:'Cutoff saved.'}});});
 await page.reload();
 await page.getByRole('button',{name:/My line duty/}).click();
 await page.getByRole('button',{name:/Team Colleague/}).click();
 await page.getByLabel('Use the system default (7:00 pm)').uncheck();
 await page.getByLabel('Daily cutoff time (station local)').fill('17:30');
 await page.getByRole('button',{name:'Save cutoff'}).click();
 await expect.poll(()=>saved).toEqual({action:'set',uid:'team-member',cutoffTime:'17:30'});
});

test('admin can save station timezone and station contacts',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockAccount(page,true);
 let stationSaved:unknown,contactSaved:unknown;
 await page.route('**/api/station-contacts*',async route=>{if(route.request().method()==='POST'){contactSaved=route.request().postDataJSON();await route.fulfill({json:{message:'Contact saved.'}});}else await route.fulfill({json:{contacts:[]}});});
 await page.getByRole('button',{name:'Admin',exact:true}).click();await page.getByRole('button',{name:'Stations',exact:true}).click();
 await page.getByRole('button',{name:/Wilson Airport/}).click();
 const sheet=page.getByRole('dialog',{name:'Work station'});await expect(sheet).toHaveClass(/station-bottom-sheet/);
 await expect.poll(async()=>{const box=await sheet.boundingBox();return Math.abs(box!.y+box!.height-844);}).toBeLessThan(2);
 await page.getByLabel('Find a time zone').fill('Juba');
 await page.getByLabel('Station time zone').selectOption('Africa/Juba');
 await expect(page.getByLabel('Station time zone')).toHaveValue('Africa/Juba');
 await page.getByLabel('Contact name / department').fill('Maintenance');await page.getByLabel('Email',{exact:true}).fill('maintenance@example.com');await page.getByLabel('Phone',{exact:true}).fill('0700123456');
 await page.getByRole('button',{name:'Save contact',exact:true}).click();await expect.poll(()=>contactSaved).toMatchObject({stationId:'wilson',name:'Maintenance',email:'maintenance@example.com',phone:'0700123456'});
 await page.route('**/api/admin',async route=>{if(route.request().method()==='POST'){stationSaved=route.request().postDataJSON();await route.fulfill({json:{message:'Saved.'}});}else await route.fulfill({json:{users:[profile],stations:[],settings:{allowManualTimes:false},positions:[],reports:[]}});});
 await page.getByRole('button',{name:'Save station',exact:true}).click();await expect.poll(()=>stationSaved).toMatchObject({action:'station',timeZone:'Africa/Juba'});
});
test('admin selects users and station contacts, adds custom emails, and preserves recipients after reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});const data=await mockAccount(page,true);
 const contacts=[{name:'Test Member',email:'test@example.com',kind:'user'},{name:'Nairobi — Maintenance',email:'maint@example.com',kind:'station'}];
 let saved:unknown;
 await page.route('**/api/admin',async route=>{if(route.request().method()==='POST'){saved=route.request().postDataJSON();data.settings.alertEmails=(saved as {alertEmails:string[]}).alertEmails;await route.fulfill({json:{message:'Saved.'}});}else await route.fulfill({json:{users:[profile],stations:data.stations,settings:data.settings,positions:[],reports:[],alertContacts:contacts}});});
 await page.getByRole('button',{name:'Admin',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 const search=page.getByLabel('Search alert recipients');
 await search.fill('Test');await page.getByRole('checkbox',{name:/Test Member/}).check();
 await search.fill('Nairobi');await page.getByRole('checkbox',{name:/Nairobi — Maintenance/}).check();
 await search.fill('safety@example.com');await page.getByRole('button',{name:'Add email: safety@example.com'}).click();
 await search.fill('SAFETY@example.com');await search.press('Enter');await expect(page.getByRole('button',{name:'Remove safety@example.com'})).toHaveCount(1);
 await page.getByRole('button',{name:'Remove test@example.com'}).click();
 await page.getByRole('button',{name:'Save alert recipients'}).click();
 await expect.poll(()=>saved).toEqual({action:'alertRecipients',alertEmails:['maint@example.com','safety@example.com']});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.reload();await page.getByRole('button',{name:'Admin',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remove maint@example.com'})).toBeVisible();await expect(page.getByRole('button',{name:'Remove safety@example.com'})).toBeVisible();
 await search.fill('not an email');await search.press('Enter');await expect(page.getByRole('alert').filter({hasText:'valid email address'})).toBeVisible();
});
test('calendar turns red above twelve hours and shows local and Zulu details',async({page})=>{
 const data=await mockAccount(page);const date=dateKey(Date.now()-DAY_MS);
 data.days=[{id:'long',uid:profile.uid,company:profile.company,date,status:'recorded',reason:'',closed:false,audit:[],revision:1,sessions:[{id:'s',start:parseTime(date,'05:00','Africa/Juba'),end:parseTime(date,'18:01','Africa/Juba'),timeZone:'Africa/Juba',stationId:'aweil',station:'Aweil',notes:''}]}];
 await page.reload();const cell=page.getByRole('button',{name:new RegExp(`^${date}, recorded`)});await expect(cell).toHaveClass(/over-limit-day/);await cell.click();await expect(page.getByText('Aweil · Africa/Juba')).toBeVisible();await expect(page.getByText(new RegExp(`${date} 03:00:00Z`))).toBeVisible();
});
test('denied next-day check-in leaves a persistent rest explanation',async({page})=>{
 await mockAccount(page);await page.route('**/api/duty',route=>route.fulfill({status:403,json:{error:'You need at least 8 hours of rest before your next duty day. Check-in is blocked.'}}));
 await page.getByRole('button',{name:'Check in',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'8 hours of rest'})).toBeVisible();await expect(page.getByRole('button',{name:'Check in',exact:true})).toBeVisible();
});
test('user guide is available before sign-in and admin manual is hidden from members',async({page,request})=>{
 expect((await request.get('/api/manual')).status()).toBe(401);
 await page.goto('/guide');await expect(page.getByRole('heading',{name:'User guide',exact:true})).toBeVisible();await expect(page.getByText('1. Get access and sign in',{exact:true})).toHaveCount(2);
 await mockAccount(page);await expect(page.getByRole('button',{name:'Admin manual',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'User guide',exact:true}).last().click();await expect(page.getByRole('heading',{name:'User guide',exact:true,level:2})).toBeVisible();
});
test('admin manual is a protected tab and station contacts can be deactivated without deleting',async({page})=>{
 await mockAccount(page,true);await page.route('**/api/manual',route=>route.fulfill({json:{title:'Admin manual',intro:'Administrator instructions.',sections:[{id:'setup',title:'Setup checklist',steps:['Assign line managers.']}]}}));
 await page.getByRole('button',{name:'Admin manual',exact:true}).last().click();await expect(page.getByRole('heading',{name:'Setup checklist'})).toBeVisible();
 await page.getByRole('button',{name:'Admin',exact:true}).click();await page.getByRole('button',{name:'Stations',exact:true}).click();let saved:unknown;let active=true;
 await page.route('**/api/station-contacts*',async route=>{if(route.request().method()==='POST'){saved=route.request().postDataJSON();active=(saved as {active:boolean}).active;await route.fulfill({json:{message:'Contact updated.'}});}else await route.fulfill({json:{contacts:[{id:'operations',stationId:'wilson',name:'Operations',email:'ops@example.com',phone:'0700000000',active}]}});});
 await page.getByRole('button',{name:/Wilson Airport/}).click();await expect(page.getByRole('button',{name:/Delete Operations/})).toHaveCount(0);await page.getByRole('button',{name:'Deactivate Operations',exact:true}).click();await expect.poll(()=>saved).toEqual({action:'setActive',stationId:'wilson',id:'operations',active:false});await expect(page.getByRole('button',{name:'Reactivate Operations'})).toBeVisible();await page.getByRole('button',{name:'Reactivate Operations'}).click();await expect(page.getByRole('button',{name:'Deactivate Operations'})).toBeVisible();
});
