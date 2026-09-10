import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../lib/api-response';
test('HTML deployment errors identify the endpoint and status without exposing the response',async()=>{
 await assert.rejects(readApiResponse(new Response('<!DOCTYPE html><p>private infrastructure details</p>',{status:502}),'/api/duty?uid=private-user'),error=>{
  assert.ok(error instanceof Error);assert.match(error.message,/HTTP 502, \/api\/duty/);assert.doesNotMatch(error.message,/private|DOCTYPE|Unexpected token/);return true;
 });
});
test('API responses preserve successful data and actionable server errors',async()=>{
 assert.deepEqual(await readApiResponse(new Response('{"ok":true}'),'/api/duty'),{ok:true});
 await assert.rejects(readApiResponse(new Response('{"error":"Rest is required."}',{status:403}),'/api/duty'),/Rest is required/);
});
