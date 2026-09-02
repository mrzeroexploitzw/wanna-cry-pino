import { db, now } from '../../database/db.js';

function ensure(groupId){
  let row=db.prepare('SELECT * FROM group_stats WHERE group_id=?').get(groupId);
  if(!row){db.prepare('INSERT INTO group_stats(group_id,last_updated_at) VALUES(?,?)').run(groupId,now());row=db.prepare('SELECT * FROM group_stats WHERE group_id=?').get(groupId);}
  return row;
}
export function syncGroupInfo(groupId, info){
  const count=Number(info?.total_participant_count ?? info?.participants?.length ?? 0);
  const admins=(info?.participants||[]).filter(p=>p.is_admin||p.admin).map(p=>p.wa_id||p.id).filter(Boolean);
  db.prepare(`INSERT INTO group_stats(group_id,total_members,last_subject,last_description,last_admins,last_updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET total_members=excluded.total_members,last_subject=excluded.last_subject,last_description=excluded.last_description,last_admins=excluded.last_admins,last_updated_at=excluded.last_updated_at`).run(groupId,count,info?.subject||null,info?.description||null,JSON.stringify(admins),now());
  return ensure(groupId);
}
export function recordJoin(groupId,userId,currentCount=null){
  ensure(groupId);db.prepare('INSERT INTO group_member_events(group_id,user_whatsapp_id,event_type,created_at) VALUES(?,?,?,?)').run(groupId,userId,'join',now());
  db.prepare('UPDATE group_stats SET total_members=COALESCE(?,total_members+1),joined_count=joined_count+1,last_updated_at=? WHERE group_id=?').run(currentCount,now(),groupId);return ensure(groupId);
}
export function recordLeave(groupId,userId,currentCount=null){
  ensure(groupId);db.prepare('INSERT INTO group_member_events(group_id,user_whatsapp_id,event_type,created_at) VALUES(?,?,?,?)').run(groupId,userId,'leave',now());
  db.prepare('UPDATE group_stats SET total_members=MAX(0,COALESCE(?,total_members-1)),left_count=left_count+1,last_updated_at=? WHERE group_id=?').run(currentCount,now(),groupId);return ensure(groupId);
}
export function groupStats(groupId){return ensure(groupId);}
