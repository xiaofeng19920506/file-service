import WorshipSongsEditor from '../components/worship/WorshipSongsEditor';

type WorshipSongsInvitePageProps = {
  inviteToken?: string;
  bulletinId?: string;
};

export default function WorshipSongsInvitePage({
  inviteToken,
  bulletinId,
}: WorshipSongsInvitePageProps) {
  return (
    <main className="worship-songs-invite-shell">
      <WorshipSongsEditor inviteToken={inviteToken} bulletinId={bulletinId} />
    </main>
  );
}
