import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Row, Col, message, Typography } from 'antd';
import { VideoCameraOutlined } from '@ant-design/icons';
import PromptForm from './components/PromptForm';
import VideoPreview from './components/VideoPreview';
import VideoList from './components/VideoList';
import {
  generateTutorial,
  previewContent,
  getAllJobs,
  getJobStatus,
  deleteJob,
} from './api/api';
import type { TutorialContent, GenerationJob, GenerateRequest } from './types';

const { Header, Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  const [previewData, setPreviewData] = useState<TutorialContent | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchJobs = useCallback(async () => {
    try {
      const allJobs = await getAllJobs();
      setJobs(allJobs.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch {
      console.error('Failed to fetch jobs');
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    const activeJobs = jobs.filter(
      (j) => !['completed', 'error'].includes(j.status)
    );

    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      let hasChanges = false;
      const updatedJobs = await Promise.all(
        jobs.map(async (job) => {
          if (['completed', 'error'].includes(job.status)) {
            return job;
          }
          try {
            const updated = await getJobStatus(job.id);
            if (updated.status !== job.status) {
              hasChanges = true;
              if (updated.status === 'completed') {
                messageApi.success(`Video "${updated.content?.title}" is ready!`);
              } else if (updated.status === 'error') {
                messageApi.error(`Video generation failed: ${updated.error}`);
              }
            }
            return updated;
          } catch {
            return job;
          }
        })
      );

      if (hasChanges) {
        setJobs(updatedJobs);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobs, messageApi]);

  const handlePreview = async (prompt: string) => {
    setPreviewLoading(true);
    try {
      const content = await previewContent(prompt);
      setPreviewData(content);
      messageApi.success('Preview generated successfully!');
    } catch (error: any) {
      messageApi.error(error.response?.data?.error || 'Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async (request: GenerateRequest) => {
    setLoading(true);
    try {
      const response = await generateTutorial(request);
      messageApi.info('Video generation started! You can track progress below.');
      await fetchJobs();

      const checkStatus = async () => {
        const job = await getJobStatus(response.jobId);
        const updatedJobs = jobs.map((j) => (j.id === job.id ? job : j));
        if (!updatedJobs.find((j) => j.id === job.id)) {
          updatedJobs.unshift(job);
        }
        setJobs(updatedJobs.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      };

      await checkStatus();
    } catch (error: any) {
      messageApi.error(error.response?.data?.error || 'Failed to start generation');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      await deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      messageApi.success('Video deleted successfully');
    } catch {
      messageApi.error('Failed to delete video');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#001529',
          padding: '0 24px',
        }}
      >
        <VideoCameraOutlined style={{ fontSize: 24, color: '#1890ff', marginRight: 12 }} />
        <Title level={3} style={{ margin: 0, color: '#fff' }}>
          Coding Video Tutorial Generator
        </Title>
      </Header>
      <Content style={{ padding: '24px', background: '#141414' }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={12}>
            <PromptForm
              onGenerate={handleGenerate}
              onPreview={handlePreview}
              loading={loading}
              previewLoading={previewLoading}
            />
          </Col>
          <Col xs={24} lg={12}>
            <VideoPreview content={previewData} loading={previewLoading} />
          </Col>
        </Row>
        <Row style={{ marginTop: 24 }}>
          <Col span={24}>
            <VideoList jobs={jobs} onDelete={handleDelete} onRefresh={fetchJobs} />
          </Col>
        </Row>
      </Content>
    </Layout>
  );
};

export default App;
