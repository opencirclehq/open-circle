import { toast } from 'sonner';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Participation from '../src/pages/Participation';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { COMMUNITY_KEY } from '../src/hooks/use-community';
import { api, ApiError } from '../src/lib/api';
import type { ParticipationState } from '../shared/coordination';
import type { CommunityState } from '../shared/community';
import type { MemberCommunityState } from '../shared/coordination';

vi.mock('../src/lib/api',async original=>({...await original<typeof import('../src/lib/api')>(),api:{community:vi.fn(),participation:vi.fn(),linkWhatsapp:vi.fn(),participate:vi.fn(),signOut:vi.fn()}}));
const community:CommunityState={profile:{id:1,login:'Alice',avatarUrl:'https://avatars.githubusercontent.com/u/1'},signInAvailable:true,tools:[],counts:{},voted:[],toolVotes:{}};
const initial:ParticipationState={activity:{linked:true,login:'Alice',enabled:true,tracking:true,contributions:1,reviewPeers:1,target:4,requiredReviewPeers:2,inactiveDays:3,graceRemainingDays:0,awayUntil:null,awayRequestedDays:null,pendingContributions:0,removalReview:false},projects:[{id:'project_1',title:'Portfolio',url:'https://example.test',owner:'Bob',reviews:0,status:'approved',assignedTo:['Alice'],createdAt:1}],help:[],contributions:[]};
const emptyRoutine:MemberCommunityState={timezone:'Africa/Lagos',quietStart:22,quietEnd:8,groupSchedule:false,updates:[],sessions:[],mentor:{available:false,skills:[],weeklyLimit:2},assignedHelp:[],repositories:[]};
const clients:QueryClient[]=[];

it('shows weekly group interactions alongside confirmed help and preserves genuine zero counts',async()=>{
  const counts={messages:0,replies:0,media:0,pollVotes:2,messagesReactedTo:3,reactionAdds:4,reactionRemovals:1,reactionsReceived:0};
  mount({...initial,activity:{...initial.activity,engagement:{startedAt:1,week:'2026-10-19',total:{...counts,messages:12,messagesReactedTo:8},weekly:counts,warnings:2,enforcement:true}}});
  await screen.findByText('In the group this week');
  const list=screen.getByText('Messages sent').closest('dl')!;
  expect(within(list).getByText('Messages sent').nextElementSibling?.textContent).toBe('0');
  expect(within(list).getByText('Messages reacted to').nextElementSibling?.textContent).toBe('3');
  expect(within(list).getByText('Poll votes').nextElementSibling?.textContent).toBe('2');
  expect(screen.getByText(/2\/3 inactivity warnings this week/)).toBeTruthy();
  expect(screen.getByText('Confirmed feedback')).toBeTruthy();
  expect(screen.getByText(/Group reactions do not earn leaderboard points/)).toBeTruthy();
  expect(screen.getByText(/Recorded totals: 12 messages, 8 messages reacted to/)).toBeTruthy();
});

it('does not display unrecorded group activity as zero before tracking starts',async()=>{
  const counts={messages:0,replies:0,media:0,pollVotes:0,messagesReactedTo:0,reactionAdds:0,reactionRemovals:0,reactionsReceived:0};
  mount({...initial,activity:{...initial.activity,engagement:{startedAt:null,week:'2026-10-19',total:counts,weekly:counts,warnings:0,enforcement:false}}});
  await screen.findByText('Your activity');
  expect(screen.queryByText('Messages sent')).toBeNull();
  expect(screen.getByText(/Group message and reaction recording has not started/)).toBeTruthy();
});

it('shows star support with zero confirmed feedback and distinguishes verified zero from unavailable star history',async()=>{
  mount({...initial,activity:{...initial.activity,contributions:0,starSupport:{members:3,points:60,updatedAt:Date.now()}}});
  await screen.findByText('Repository star support');
  expect(screen.getByText('Members supported').nextElementSibling?.textContent).toBe('3');
  expect(screen.getByText('Leaderboard points from stars').nextElementSibling?.textContent).toBe('60');
  expect(screen.getByRole('progressbar',{name:'Confirmed feedback'}).getAttribute('aria-valuenow')).toBe('0');
  expect(screen.queryByText(/Star support is waiting/)).toBeNull();
});

it('shows a completed GitHub refresh with no eligible stars as an honest zero',async()=>{
  mount({...initial,activity:{...initial.activity,starSupport:{members:0,points:0,updatedAt:Date.now()}}});
  await screen.findByText('Members supported');
  expect(screen.getByText('Members supported').nextElementSibling?.textContent).toBe('0');
  expect(screen.getByText('Leaderboard points from stars').nextElementSibling?.textContent).toBe('0');
});

it('lets a member record repo help, focuses the feedback form and submits for confirmation',async()=>{
  const user=userEvent.setup();
  const repo={id:'repo_1',owner:'Bob',fullName:'Bob/tool',url:'https://github.com/Bob/tool',license:'MIT',fork:false,summary:'A useful tool for learning TypeScript.',helpWanted:'Help with tests and documentation.',issues:[],skills:['typescript'],tagOwner:false,status:'approved' as const,reason:'',needsHelp:true,createdAt:1,checkedAt:1,announcedAt:null,followedUpAt:null,pinStatus:'idle' as const};
  mount({...initial,community:{...emptyRoutine,repositories:[repo,{...repo,id:'mine',owner:'Alice'},{...repo,id:'paused',needsHelp:false},{...repo,id:'pending',status:'pending'}]}},{entry:'/participation#repositories'});
  vi.mocked(api.participate).mockResolvedValue({...initial,contributions:[]});
  await screen.findByRole('tab',{name:'Repos',selected:true});
  expect(screen.getAllByRole('button',{name:'Record your help'})).toHaveLength(1);
  await user.click(screen.getByRole('button',{name:'Record your help'}));
  expect(await screen.findByRole('tab',{name:'Feedback',selected:true})).toBeTruthy();
  const field=screen.getByLabelText('What you tried and a useful observation or suggestion');
  expect(document.activeElement).toBe(field);
  const text='I tested the setup and improved the README installation steps.';
  await user.type(field,text);
  await user.click(screen.getByRole('button',{name:'Submit feedback'}));
  await waitFor(()=>expect(vi.mocked(api.participate).mock.calls[0]?.[0]).toEqual({action:'review',projectId:'repo_1',text}));
});
function HistoryControls(){
  const navigate=useNavigate();
  return <><button onClick={()=>navigate(-1)}>Go back</button><button onClick={()=>navigate(1)}>Go forward</button></>;
}
function mount(data=initial,{entry='/participation',history=false}={}){
  vi.mocked(api.participation).mockResolvedValue(data);
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0,gcTime:Infinity,refetchOnWindowFocus:false},mutations:{retry:false}}});clients.push(client);
  client.setQueryData(COMMUNITY_KEY,community);
  render(<QueryClientProvider client={client}><TooltipProvider><MemoryRouter initialEntries={[entry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}>{history&&<HistoryControls/>}<Participation/></MemoryRouter></TooltipProvider></QueryClientProvider>);
  return client;
}
beforeEach(()=>{vi.mocked(api.community).mockReset().mockResolvedValue(community);vi.mocked(api.participation).mockReset();vi.mocked(api.linkWhatsapp).mockReset();vi.mocked(api.participate).mockReset();});
afterEach(()=>clients.splice(0).forEach(client=>client.clear()));

it('keeps drafts across tabs and browser history, then removes every private panel after sign-out',async()=>{
  const user=userEvent.setup();
  const client=mount({...initial,community:emptyRoutine},{history:true});
  await screen.findByRole('tab',{name:'Overview',selected:true});
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  for(const tab of screen.getAllByRole('tab')){
    const panel=document.getElementById(tab.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  }
  await user.click(screen.getByRole('tab',{name:'Projects'}));
  await user.type(screen.getByLabelText('Project name'),'My project draft');
  await user.click(screen.getByRole('tab',{name:'Help'}));
  await user.type(screen.getByLabelText(/Your mentoring skills, separated by commas/),'typescript');
  await user.click(screen.getByRole('tab',{name:'Repos'}));
  await user.click(screen.getByText('Submit an open-source repo'));
  await user.type(screen.getByLabelText('What does it do?'),'My unfinished repository description');
  await user.click(screen.getByRole('tab',{name:'Projects'}));
  expect((screen.getByLabelText('Project name') as HTMLInputElement).value).toBe('My project draft');
  await user.click(screen.getByRole('button',{name:'Go back'}));
  expect(await screen.findByRole('tab',{name:'Repos',selected:true})).toBeTruthy();
  expect((screen.getByLabelText('What does it do?') as HTMLTextAreaElement).value).toBe('My unfinished repository description');
  await user.click(screen.getByRole('button',{name:'Go back'}));
  expect(await screen.findByRole('tab',{name:'Help',selected:true})).toBeTruthy();
  expect((screen.getByLabelText(/Your mentoring skills, separated by commas/) as HTMLInputElement).value).toBe('typescript');
  await user.click(screen.getByRole('button',{name:'Go forward'}));
  expect(await screen.findByRole('tab',{name:'Repos',selected:true})).toBeTruthy();
  await act(async()=>{client.setQueryData(COMMUNITY_KEY,{...community,profile:null});});
  await screen.findByRole('link',{name:'Sign in with GitHub'});
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(document.querySelector('input[name="title"]')).toBeNull();
  expect(document.querySelector('textarea[name="summary"]')).toBeNull();
});

it('supports arrow keys, Home and End while exposing only the selected tab panel',async()=>{
  const user=userEvent.setup();mount();
  await user.click(await screen.findByRole('tab',{name:'Overview'}));
  const navigation=screen.getByRole('tablist',{name:'Participation sections'});
  const scroll=vi.fn();navigation.scrollIntoView=scroll;
  await user.keyboard('{ArrowRight}');
  expect(await screen.findByRole('tab',{name:'Catch up',selected:true})).toBeTruthy();
  expect(scroll).toHaveBeenCalledWith({block:'start',behavior:'instant'});
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  await user.keyboard('{End}');
  expect(await screen.findByRole('tab',{name:'Feedback',selected:true})).toBeTruthy();
  await user.keyboard('{Home}');
  expect(await screen.findByRole('tab',{name:'Overview',selected:true})).toBeTruthy();
});

it('keeps keyboard focus in the tablist when returning to an existing feedback draft',async()=>{
  const user=userEvent.setup();mount();
  await user.click(await screen.findByRole('tab',{name:'Projects'}));
  await user.click(screen.getByRole('button',{name:'Give feedback'}));
  const field=screen.getByLabelText('What you tried and a useful observation or suggestion');
  expect(document.activeElement).toBe(field);
  await user.type(field,'My unfinished feedback draft');
  await user.click(screen.getByRole('tab',{name:'Help'}));
  await user.keyboard('{End}');
  const tab=await screen.findByRole('tab',{name:'Feedback',selected:true});
  expect(document.activeElement).toBe(tab);
  expect((screen.getByLabelText('What you tried and a useful observation or suggestion') as HTMLTextAreaElement).value).toBe('My unfinished feedback draft');
  await user.keyboard('{Home}');
  expect(document.activeElement).toBe(await screen.findByRole('tab',{name:'Overview',selected:true}));
});

it.each([['repositories','Repos','Open-source repos'],['catch-up','Catch up','Catch up'],['unknown','Overview','Your activity']])('opens the correct section from #%s',async(hash,tab,heading)=>{
  mount({...initial,community:emptyRoutine},{entry:`/participation#${hash}`});
  await screen.findByRole('tab',{name:tab,selected:true});
  expect(screen.getByRole('heading',{name:heading})).toBeTruthy();
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

it('keeps the requested section in the GitHub sign-in link',async()=>{
  const client=mount(initial,{entry:'/participation#repositories'});
  await screen.findByRole('tab',{name:'Repos',selected:true});
  await act(async()=>{client.setQueryData(COMMUNITY_KEY,{...community,profile:null});});
  const link=await screen.findByRole('link',{name:'Sign in with GitHub'});
  expect(new URL(link.getAttribute('href')!,'https://opencircle.test').searchParams.get('returnTo')).toBe('/participation#repositories');
});

it('routes questions to Community and preserves the existing project-feedback draft',async()=>{
  const user=userEvent.setup();
  mount();
  await user.click(await screen.findByRole('tab',{name:'Projects'}));
  await user.click(screen.getByRole('button',{name:'Give feedback'}));
  await user.type(screen.getByLabelText('What you tried and a useful observation or suggestion'),'Feedback for the first project');
  await user.click(screen.getByRole('tab',{name:'Help'}));
  expect(screen.getByRole('link',{name:'Open questions'}).getAttribute('href')).toBe('/community?tab=questions');
  expect(screen.queryByRole('button',{name:'Post help request'})).toBeNull();
  await user.click(screen.getByRole('tab',{name:'Feedback'}));
  expect((screen.getByLabelText('What you tried and a useful observation or suggestion') as HTMLTextAreaElement).value).toBe('Feedback for the first project');
});

it('collapses completed onboarding into instructions that can be reopened, and restores the guide after sign-out',async()=>{
  const user=userEvent.setup();
  const client=mount();
  await screen.findByText('Your activity');
  expect(screen.queryByText('Start here')).toBeNull();
  const summary=screen.getByText('Instructions');
  const disclosure=summary.closest('details')!;
  expect(disclosure.open).toBe(false);
  await user.click(summary);
  expect(disclosure.open).toBe(true);
  expect(within(disclosure).getByRole('link',{name:'Join the developer board'})).toBeTruthy();
  await user.click(summary);
  expect(disclosure.open).toBe(false);
  await act(async()=>{client.setQueryData(COMMUNITY_KEY,{...community,profile:null});});
  await screen.findByRole('link',{name:'Sign in with GitHub'});
  expect(screen.getByText('Start here')).toBeTruthy();
  expect(screen.queryByText('Instructions')).toBeNull();
});

it('directs linking to the bot DM with a short-lived sender verification code',async()=>{
  const user=userEvent.setup();mount({...initial,activity:{...initial.activity,linked:false,login:null}});
  vi.mocked(api.linkWhatsapp).mockResolvedValue({id:'challenge',code:'ABC123',expiresAt:Date.now()+600_000,botChatUrl:'https://wa.me/15550000000?text=%2Flink%20ABC123'});
  const phone=await screen.findByLabelText('Your WhatsApp group number');
  expect(screen.getByText('Start here')).toBeTruthy();
  expect(screen.queryByText('Instructions')).toBeNull();
  expect(phone.getAttribute('placeholder')).toBe('e.g. +234 803 123 4567');
  await user.type(phone,'0803 123 4567');
  await user.click(screen.getByRole('button',{name:'Get linking code'}));
  expect((await screen.findByRole('alert')).textContent).toContain('country code');
  expect(api.linkWhatsapp).not.toHaveBeenCalled();
  expect((phone as HTMLInputElement).value).toBe('0803 123 4567');
  await user.clear(phone);
  await user.type(phone,'+234 803 123 4567');
  await user.click(screen.getByRole('button',{name:'Get linking code'}));
  await screen.findByText('/link ABC123');expect(api.linkWhatsapp).toHaveBeenCalledWith('+2348031234567',expect.anything());
  expect(screen.getByText('Send this command to the OpenCircle bot in a private WhatsApp chat from that number:')).toBeTruthy();
  expect(screen.getByText(/Open the bot chat and send the prefilled command/).textContent).toContain('/link does not work in the group.');
  const chat=screen.getByRole('link',{name:'Open bot chat'});
  expect(chat.getAttribute('href')).toBe('https://wa.me/15550000000?text=%2Flink%20ABC123');
  expect(chat.getAttribute('target')).toBe('_blank');
  expect(chat.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.queryByText('Send this in the WhatsApp group from your number:')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Copy command'}));
  expect(await navigator.clipboard.readText()).toBe('/link ABC123');
  await user.type(screen.getByLabelText('Your WhatsApp group number'),'8');expect(screen.queryByText('/link ABC123')).toBeNull();
  expect(screen.queryByRole('link',{name:'Open bot chat'})).toBeNull();
});

it('focuses feedback, preserves failed submissions, saves useful reviews and requests a break',async()=>{
  const user=userEvent.setup();mount();
  await user.click(await screen.findByRole('tab',{name:'Projects'}));
  await user.click(await screen.findByRole('button',{name:'Give feedback'}));
  const field=screen.getByLabelText('What you tried and a useful observation or suggestion');
  expect(document.activeElement).toBe(field);
  const feedback='I tested your search form. Please add a clear label and an empty state.';
  await user.type(field,feedback);
  vi.mocked(api.participate).mockRejectedValueOnce(new ApiError(503,'offline','The bot is unavailable.'));
  await user.click(screen.getByRole('button',{name:'Submit feedback'}));await screen.findByText('The bot is unavailable.');expect((field as HTMLTextAreaElement).value).toBe(feedback);
  vi.mocked(api.participate).mockResolvedValue(initial);
  await user.click(screen.getByRole('button',{name:'Submit feedback'}));await waitFor(()=>expect(toast.success).toHaveBeenCalledWith('Your contribution is saved and awaits confirmation.',expect.anything()));
  expect(api.participate).toHaveBeenLastCalledWith({action:'review',projectId:'project_1',text:feedback},expect.anything());
  await user.click(screen.getByRole('tab',{name:'Overview'}));
  await user.click(screen.getByRole('button',{name:'Request break'}));await waitFor(()=>expect(toast.success).toHaveBeenCalledWith('Your break request is waiting for admin approval.',expect.anything()));
  expect(api.participate).toHaveBeenLastCalledWith({action:'away',days:7},expect.anything());
});

it('shows owner confirmation and clears private participation after sign-out',async()=>{
  const user=userEvent.setup();
  const client=mount({...initial,contributions:[{id:'feedback_1',by:'Bob',for:'Alice',kind:'review',targetId:'project_2',text:'Useful feedback on your project.',status:'pending',createdAt:1}]});
  vi.mocked(api.participate).mockResolvedValue(initial);
  await user.click(await screen.findByRole('tab',{name:'Feedback'}));
  await user.click(await screen.findByRole('button',{name:'Confirm useful'}));await waitFor(()=>expect(api.participate).toHaveBeenCalledWith({action:'confirm',id:'feedback_1',approve:true},expect.anything()));
  vi.mocked(api.community).mockResolvedValue({...community,profile:null});
  await act(async()=>{client.setQueryData(COMMUNITY_KEY,{...community,profile:null});});
  await screen.findByRole('link',{name:'Sign in with GitHub'});
  expect(client.getQueriesData({queryKey:['participation']}).every(([,data])=>data===undefined)).toBe(true);expect(screen.queryByText('Projects to review')).toBeNull();
});

it('shows catch-up and sessions, saves mentor preferences and keeps failed drafts',async()=>{
  const user=userEvent.setup();
  const routine:MemberCommunityState={timezone:'Africa/Lagos',quietStart:22,quietEnd:8,groupSchedule:true,updates:[{id:'update_1',date:'2026-10-15',title:'First community task',text:'Try the search form and suggest one improvement. <img src=x>',createdAt:Date.parse('2026-10-15T09:00:00Z'),groupSentAt:null}],sessions:[{id:'help_1',title:'Community help session',startsAt:Date.parse('2026-10-16T17:00:00Z'),endsAt:Date.parse('2026-10-16T18:00:00Z')}],mentor:{available:false,skills:[],weeklyLimit:2},assignedHelp:['help_1']};
  const client=mount({...initial,community:routine,help:[{id:'help_1',owner:'Bob',question:'How do I improve this React form?',createdAt:1,status:'open',skills:['react']}]});
  await user.click(await screen.findByRole('tab',{name:'Catch up'}));
  expect(await screen.findByText('First community task')).toBeTruthy();
  expect(screen.getByText('Community help session')).toBeTruthy();
  expect(document.querySelector('#catch-up img')).toBeNull();
  await user.click(screen.getByRole('tab',{name:'Help'}));
  await user.click(screen.getByLabelText('Available for help requests'));
  const skills=screen.getByLabelText(/Your mentoring skills, separated by commas/);
  await user.type(skills,'react, typescript');
  vi.mocked(api.participate).mockRejectedValueOnce(new ApiError(503,'offline','The bot is unavailable.'));
  await user.click(screen.getByRole('button',{name:'Save mentor preferences'}));
  await screen.findByText('The bot is unavailable.');
  expect((skills as HTMLInputElement).value).toBe('react, typescript');
  vi.mocked(api.participate).mockResolvedValue({...initial,community:{...routine,mentor:{available:true,skills:['react','typescript'],weeklyLimit:2}}});
  await user.click(screen.getByRole('button',{name:'Save mentor preferences'}));
  await waitFor(()=>expect(api.participate).toHaveBeenLastCalledWith({action:'mentor',available:true,skills:['react','typescript'],weeklyLimit:2},expect.anything()));
  expect(screen.getByRole('link',{name:'Open questions'}).getAttribute('href')).toBe('/community?tab=questions');
  await act(async()=>{client.setQueryData(COMMUNITY_KEY,{...community,profile:null});});
  await screen.findByRole('link',{name:'Sign in with GitHub'});
  expect(screen.queryByText('First community task')).toBeNull();
  expect(screen.getByText('Start here')).toBeTruthy();
});

it('paginates projects and feedback independently while keeping later-page actions usable',async()=>{
  const data:ParticipationState={...initial,projects:Array.from({length:12},(_,index)=>({...initial.projects[0],id:`project_${index}`,title:`Project ${index}`})),help:Array.from({length:12},(_,index)=>({id:`help_${index}`,owner:'Bob',question:`Question ${index}`,createdAt:1,status:'open'})),contributions:Array.from({length:12},(_,index)=>({id:`feedback_${index}`,by:'Bob',for:'Alice',kind:'review',targetId:'project_1',text:`Feedback ${index}`,status:'pending',createdAt:1}))};
  mount(data);
  const user=userEvent.setup();
  await user.click(await screen.findByRole('tab',{name:'Projects'}));
  await screen.findByRole('list',{name:'Projects to review'});
  const nav=(name:string)=>within(screen.getByRole('navigation',{name:`${name} pagination`}));
  expect(within(screen.getByRole('list',{name:'Projects to review'})).getAllByRole('listitem')).toHaveLength(10);
  await user.click(nav('Projects to review').getByRole('button',{name:'Next'}));
  expect(within(screen.getByRole('list',{name:'Projects to review'})).getAllByRole('listitem')).toHaveLength(2);
  await user.click(within(screen.getByText('Project 10').closest('li')!).getByRole('button',{name:'Give feedback'}));
  expect(screen.getByText('Feedback for Project 10')).toBeTruthy();
  await user.click(screen.getByRole('tab',{name:'Help'}));
  expect(screen.getByRole('link',{name:'Open questions'})).toBeTruthy();
  await user.click(screen.getByRole('tab',{name:'Feedback'}));
  await user.click(nav('Feedback').getByRole('button',{name:'Next'}));
  expect(within(screen.getByRole('list',{name:'Feedback'})).getAllByRole('listitem')).toHaveLength(2);
  vi.mocked(api.participate).mockResolvedValue(data);
  await user.click(within(screen.getByText('Feedback 10').closest('li')!).getByRole('button',{name:'Confirm useful'}));
  await waitFor(()=>expect(api.participate).toHaveBeenCalledWith({action:'confirm',id:'feedback_10',approve:true},expect.anything()));
});

it('keeps the phone draft and issued code through failed background checks, then detects a successful link',async()=>{
  const user=userEvent.setup();
  const unlinked={...initial,activity:{...initial.activity,linked:false,login:null}};
  const client=mount(unlinked,{entry:'/participation#repositories'});
  const chat='https://wa.me/15550000000?text=%2Flink%20ABC123';
  vi.mocked(api.linkWhatsapp).mockResolvedValue({id:'challenge',code:'ABC123',expiresAt:Date.now()+600_000,botChatUrl:chat});
  const phone=await screen.findByLabelText('Your WhatsApp group number');
  await user.type(phone,'+234 803 123 4567');
  await user.click(screen.getByRole('button',{name:'Get linking code'}));
  await screen.findByText('/link ABC123');
  vi.mocked(api.participation).mockRejectedValue(new ApiError(503,'unknown','Something went wrong. Try again.'));
  await act(async()=>{await client.refetchQueries({queryKey:['participation',1]});});
  expect(screen.getByText('/link ABC123')).toBeTruthy();
  expect(screen.getByRole('link',{name:'Open bot chat'}).getAttribute('href')).toBe(chat);
  expect((screen.getByLabelText('Your WhatsApp group number') as HTMLInputElement).value).toBe('+234 803 123 4567');
  vi.mocked(api.community).mockRejectedValue(new ApiError(503,'unknown','Something went wrong. Try again.'));
  await act(async()=>{await client.refetchQueries({queryKey:COMMUNITY_KEY});});
  expect(screen.getByText('/link ABC123')).toBeTruthy();
  vi.mocked(api.community).mockResolvedValue(community);
  await act(async()=>{await client.refetchQueries({queryKey:COMMUNITY_KEY});});
  vi.mocked(api.participation).mockResolvedValue(initial);
  await user.click(screen.getByRole('button',{name:'Check link'}));
  await screen.findByRole('tab',{name:'Repos',selected:true});
  expect(screen.queryByText('/link ABC123')).toBeNull();
  expect(screen.queryByText('Start here')).toBeNull();
  expect(screen.getByText('Instructions').closest('details')!.open).toBe(false);
  expect(api.linkWhatsapp).toHaveBeenCalledTimes(1);
});

it('offers retry when sign-in cannot be checked instead of claiming sign-in is being set up',async()=>{
  vi.mocked(api.community).mockRejectedValue(new ApiError(503,'unknown','Something went wrong. Try again.'));
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0,gcTime:Infinity,refetchOnWindowFocus:false}}});clients.push(client);
  render(<QueryClientProvider client={client}><TooltipProvider><MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Participation/></MemoryRouter></TooltipProvider></QueryClientProvider>);
  await waitFor(()=>expect(client.getQueryState(COMMUNITY_KEY)?.status).toBe('error'));
  expect(screen.queryByText('GitHub sign-in is being set up.')).toBeNull();
  expect(api.participation).not.toHaveBeenCalled();
  vi.mocked(api.community).mockResolvedValue({...community,profile:null});
  await userEvent.click(within(screen.getByRole('main')).getByRole('button',{name:'Try again'}));
  await screen.findByRole('link',{name:'Sign in with GitHub'});
});

it('hides cached private participation if access is rejected',async()=>{
  const client=mount();
  await screen.findByText('Your activity');
  vi.mocked(api.participation).mockRejectedValue(new ApiError(401,'github_required','Sign in with GitHub to manage your group participation.'));
  await act(async()=>{await client.refetchQueries({queryKey:['participation',1]});});
  await waitFor(()=>expect(screen.queryByText('Your activity')).toBeNull());
  expect(within(screen.getByRole('main')).getByRole('button',{name:'Try again'})).toBeTruthy();
});

it('clears the code and private activity when a background sign-in check rejects access',async()=>{
  const user=userEvent.setup();
  const client=mount({...initial,activity:{...initial.activity,linked:false,login:null}});
  vi.mocked(api.linkWhatsapp).mockResolvedValue({id:'challenge',code:'ABC123',expiresAt:Date.now()+600_000});
  await user.type(await screen.findByLabelText('Your WhatsApp group number'),'+234 803 123 4567');
  await user.click(screen.getByRole('button',{name:'Get linking code'}));
  await screen.findByText('/link ABC123');
  vi.mocked(api.community).mockRejectedValue(new ApiError(401,'github_required','Sign in again.'));
  await act(async()=>{await client.refetchQueries({queryKey:COMMUNITY_KEY});});
  await waitFor(()=>expect(screen.queryByText('/link ABC123')).toBeNull());
  expect(screen.queryByLabelText('Your WhatsApp group number')).toBeNull();
  await waitFor(()=>expect(client.getQueriesData({queryKey:['participation']}).every(([,data])=>data===undefined)).toBe(true));
});
