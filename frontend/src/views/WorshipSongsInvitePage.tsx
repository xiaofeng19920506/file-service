import WorshipSongsEditor from '../components/worship/WorshipSongsEditor';

type WorshipSongsInvitePageProps = {
  inviteToken?: string;
  bulletinId?: string;
};

export default function WorshipSongsInvitePage({
  inviteToken,
  bulletinId,
}: WorshipSongsInvitePageProps) {
  return <WorshipSongsEditor inviteToken={inviteToken} bulletinId={bulletinId} />;
}
