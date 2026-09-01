import { useOutletContext } from 'react-router-dom';
import DailyTimelineView from '../common/DailyTimelineView.jsx';

export default function OfficerTimelineView() {
  const { ulbId, ulbName } = useOutletContext();
  return <DailyTimelineView ulbId={ulbId} ulbName={ulbName} />;
}
