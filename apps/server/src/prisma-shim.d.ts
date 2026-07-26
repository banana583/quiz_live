declare module '@prisma/client' {
  export const UserRole: { PARTICIPANT:'PARTICIPANT'; ORGANIZER:'ORGANIZER' };
  export type UserRole = 'PARTICIPANT'|'ORGANIZER';
  export const QuestionType: { SINGLE:'SINGLE'; MULTIPLE:'MULTIPLE' };
  export type QuestionType = 'SINGLE'|'MULTIPLE';
  export const SessionStatus: { LOBBY:'LOBBY'; ACTIVE:'ACTIVE'; FINISHED:'FINISHED' };
  export type SessionStatus = 'LOBBY'|'ACTIVE'|'FINISHED';
  export class PrismaClient { [key:string]: any; $disconnect():Promise<void>; $transaction(args:any[]):Promise<any>; $transaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>; }
}
