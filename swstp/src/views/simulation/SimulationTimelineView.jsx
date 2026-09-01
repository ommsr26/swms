import React from 'react';
import { useOutletContext } from 'react-router-dom';
import DailyTimelineView from '../common/DailyTimelineView.jsx';

export default function SimulationTimelineView() {
  const { ulbId, ulbName } = useOutletContext();
  return <DailyTimelineView ulbId={ulbId} ulbName={ulbName} />;
}
