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

const getProgressPercent = (status: GenerationJob['status']): number => {
  const percentages: Record<GenerationJob['status'], number> = {
    pending: 0,
    generating_content: 25,
    generating_audio: 50,
    rendering: 75,
    completed: 100,
    error: 0,
  };
  return percentages[status];
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
            {job.status !== 'completed' && job.status !== 'error' && (
              <Progress
                percent={getProgressPercent(job.status)}
                status="active"
                size="small"
              />
            )}
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
