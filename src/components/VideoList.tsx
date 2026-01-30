import React from 'react';
import {
  Card,
  List,
  Tag,
  Button,
  Space,
  Typography,
  Progress,
  Empty,
  Popconfirm,
} from 'antd';
import {
  PlayCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { GenerationJob } from '../types';
import { getVideoUrl } from '../api/api';
import { TerminalOutput } from './TerminalOutput';

const { Text, Paragraph } = Typography;

interface VideoListProps {
  jobs: GenerationJob[];
  onDelete: (jobId: string) => void;
  onRefresh: () => void;
}

const getStatusTag = (status: GenerationJob['status']) => {
  const configs: Record<GenerationJob['status'], { color: string; icon: React.ReactNode; text: string }> = {
    pending: { color: 'default', icon: <ClockCircleOutlined />, text: 'Pending' },
    generating_content: { color: 'processing', icon: <LoadingOutlined />, text: 'Generating Content' },
    generating_audio: { color: 'processing', icon: <LoadingOutlined />, text: 'Generating Audio' },
    rendering: { color: 'processing', icon: <LoadingOutlined />, text: 'Rendering Video' },
    completed: { color: 'success', icon: <CheckCircleOutlined />, text: 'Completed' },
    error: { color: 'error', icon: <CloseCircleOutlined />, text: 'Error' },
  };

  const config = configs[status];
  return (
    <Tag color={config.color} icon={config.icon}>
      {config.text}
    </Tag>
  );
};

// Phase weights for overall progress calculation
const PHASE_WEIGHTS: Record<GenerationJob['status'], { start: number; weight: number }> = {
  pending: { start: 0, weight: 0 },
  generating_content: { start: 0, weight: 25 },
  generating_audio: { start: 25, weight: 35 },
  rendering: { start: 60, weight: 40 },
  completed: { start: 100, weight: 0 },
  error: { start: 0, weight: 0 },
};

const getOverallProgress = (job: GenerationJob): number => {
  const { status, progress } = job;

  if (status === 'completed') return 100;
  if (status === 'error' || status === 'pending') return 0;

  const phaseConfig = PHASE_WEIGHTS[status];
  const subProgress = progress?.subProgress ?? 0;

  // Calculate overall progress: phase start + (subProgress / 100 * phase weight)
  return Math.round(phaseConfig.start + (subProgress / 100) * phaseConfig.weight);
};

const getElapsedTime = (startTime?: string): string => {
  if (!startTime) return '';

  const start = new Date(startTime).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);

  if (elapsed < 60) {
    return `${elapsed}s`;
  } else if (elapsed < 3600) {
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
};

interface DetailedProgressProps {
  job: GenerationJob;
}

const DetailedProgress: React.FC<DetailedProgressProps> = ({ job }) => {
  const { status, progress } = job;

  if (status === 'completed' || status === 'error') {
    return null;
  }

  const overallPercent = getOverallProgress(job);
  const currentAction = progress?.currentAction || getDefaultAction(status);
  const phaseElapsed = getElapsedTime(progress?.phaseStartedAt);
  const totalElapsed = getElapsedTime(job.startedAt);

  // Show terminal output for content generation phase
  const showTerminal = status === 'generating_content';

  return (
    <div style={{ marginTop: 12 }}>
      <Progress
        percent={overallPercent}
        status="active"
        size="small"
        strokeColor={{
          '0%': '#108ee9',
          '100%': '#87d068',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {currentAction}
        </Text>
        <Space size="small">
          {progress?.currentStep && progress?.totalSteps && (
            <Tag color="blue" style={{ margin: 0 }}>
              Step {progress.currentStep}/{progress.totalSteps}
            </Tag>
          )}
          {totalElapsed && (
            <Tag color="default" style={{ margin: 0 }}>
              {totalElapsed}
            </Tag>
          )}
        </Space>
      </div>
      {progress?.subProgress !== undefined && progress.subProgress > 0 && (
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Phase progress: {Math.round(progress.subProgress)}%
            {phaseElapsed && ` (${phaseElapsed})`}
          </Text>
        </div>
      )}
      {showTerminal && (
        <TerminalOutput
          jobId={job.id}
          enabled={true}
          defaultExpanded={true}
        />
      )}
    </div>
  );
};

const getDefaultAction = (status: GenerationJob['status']): string => {
  const actions: Record<GenerationJob['status'], string> = {
    pending: 'Waiting to start...',
    generating_content: 'AI is generating tutorial content...',
    generating_audio: 'Converting text to speech...',
    rendering: 'Rendering video...',
    completed: 'Done!',
    error: 'An error occurred',
  };
  return actions[status];
};

export const VideoList: React.FC<VideoListProps> = ({ jobs, onDelete, onRefresh }) => {
  if (jobs.length === 0) {
    return (
      <Card title="Generated Videos">
        <Empty
          description="No videos generated yet. Create your first tutorial!"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <Card
      title="Generated Videos"
      extra={
        <Button onClick={onRefresh} size="small">
          Refresh
        </Button>
      }
    >
      <List
        itemLayout="vertical"
        dataSource={jobs}
        renderItem={(job) => (
          <List.Item
            key={job.id}
            actions={
              job.status === 'completed'
                ? [
                    <Button
                      key="play"
                      type="link"
                      icon={<PlayCircleOutlined />}
                      href={getVideoUrl(job.id)}
                      target="_blank"
                    >
                      Play
                    </Button>,
                    <Button
                      key="download"
                      type="link"
                      icon={<DownloadOutlined />}
                      href={getVideoUrl(job.id)}
                      download={`tutorial-${job.id}.mp4`}
                    >
                      Download
                    </Button>,
                    <Popconfirm
                      key="delete"
                      title="Delete this video?"
                      description="This action cannot be undone."
                      onConfirm={() => onDelete(job.id)}
                      okText="Delete"
                      cancelText="Cancel"
                    >
                      <Button type="link" danger icon={<DeleteOutlined />}>
                        Delete
                      </Button>
                    </Popconfirm>,
                  ]
                : job.status === 'error'
                ? [
                    <Popconfirm
                      key="delete"
                      title="Delete this job?"
                      onConfirm={() => onDelete(job.id)}
                      okText="Delete"
                      cancelText="Cancel"
                    >
                      <Button type="link" danger icon={<DeleteOutlined />}>
                        Delete
                      </Button>
                    </Popconfirm>,
                  ]
                : []
            }
          >
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>{job.content?.title || 'Generating...'}</Text>
                  {getStatusTag(job.status)}
                </Space>
              }
              description={
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Paragraph
                    ellipsis={{ rows: 2 }}
                    type="secondary"
                    style={{ margin: 0 }}
                  >
                    {job.prompt}
                  </Paragraph>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Created: {new Date(job.createdAt).toLocaleString()}
                  </Text>
                </Space>
              }
            />
            <DetailedProgress job={job} />
            {job.status === 'error' && job.error && (
              <Text type="danger">{job.error}</Text>
            )}
          </List.Item>
        )}
      />
    </Card>
  );
};

export default VideoList;
