import test from 'node:test';
import assert from 'node:assert/strict';
import { canReview, canView } from '../lib/policy';
import type { Profile } from '../lib/duty';
const person=(uid:string,extra:Partial<Profile>={}):Profile=>({uid,company:'kasas',firstName:uid,lastName:'',name:uid,email:'test@example.com',department:'Ops',position:'Ops',photo:'',isLineManager:false,lineManagerUids:[],enabled:true,...extra});
test('members can only view their own records',()=>{
 const actor={profile:person('member'),isAdmin:false};
 assert.equal(canView(actor,actor.profile),true);
 assert.equal(canView(actor,person('other')),false);
 assert.equal(canReview(actor,actor.profile),false);
});
test('manager access needs both a manager role and an explicit reporting assignment',()=>{
 const target=person('member',{lineManagerUids:['manager','second-manager']});
 assert.equal(canReview({profile:person('manager',{isLineManager:true}),isAdmin:false},target),true);
 assert.equal(canReview({profile:person('second-manager',{isLineManager:true}),isAdmin:false},target),true);
 assert.equal(canReview({profile:person('manager'),isAdmin:false},target),false);
 assert.equal(canReview({profile:person('unassigned',{isLineManager:true}),isAdmin:false},target),false);
});
test('even administrators cannot cross company boundaries or approve themselves',()=>{
 const actor={profile:person('admin'),isAdmin:true};
 assert.equal(canReview(actor,person('member')),true);
 assert.equal(canView(actor,person('foreign',{company:'another-company'})),false);
 assert.equal(canReview(actor,actor.profile),false);
});
test('disabled membership prevents access regardless of an admin claim',()=>{
 const actor={profile:person('admin',{enabled:false}),isAdmin:true};
 assert.equal(canView(actor,actor.profile),false);
 assert.equal(canReview(actor,person('member')),false);
});
