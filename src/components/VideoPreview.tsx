import React from 'react';
import { Card, Typography, Tag, Empty, Collapse, Space } from 'antd';
import { CodeOutlined, SoundOutlined } from '@ant-design/icons';
import { Highlight, themes } from 'prism-react-renderer';
import type { TutorialContent } from '../types';

const { Title, Paragraph, Text } = Typography;

interface VideoPreviewProps {
  content: TutorialContent | null;
  loading?: boolean;
}

const getLanguageLabel = (lang: string): string => {
  const labels: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    cpp: 'C++',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
    ruby: 'Ruby',
    php: 'PHP',
  };
  return labels[lang] || lang;
};

export const VideoPreview: React.FC<VideoPreviewProps> = ({ content, loading }) => {
  if (loading) {
    return (
      <Card loading={true}>
        <div style={{ height: 200 }} />
      </Card>
    );
  }

  if (!content) {
    return (
      <Card>
        <Empty
          description="Enter a prompt and click 'Preview Content' to see the generated tutorial structure"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const collapseItems = content.steps.map((step, index) => ({
    key: String(index),
    label: (
      <Space>
        <Text strong>Step {index + 1}</Text>
        <Tag color="blue">{getLanguageLabel(step.language)}</Tag>
      </Space>
    ),
    children: (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Space align="start">
            <SoundOutlined style={{ color: '#1890ff', marginTop: 4 }} />
            <Paragraph style={{ margin: 0 }}>{step.explanation}</Paragraph>
          </Space>
        </div>
        <div>
          <Space align="start" style={{ width: '100%' }}>
            <CodeOutlined style={{ color: '#52c41a', marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <Highlight
                theme={themes.vsDark}
                code={step.code.trim()}
                language={step.language as any}
              >
                {({ style, tokens, getLineProps, getTokenProps }) => (
                  <pre
                    style={{
                      ...style,
                      padding: 16,
                      borderRadius: 8,
                      overflow: 'auto',
                      margin: 0,
                    }}
                  >
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: '2em',
                            userSelect: 'none',
                            opacity: 0.5,
                            marginRight: 16,
                          }}
                        >
                          {i + 1}
                        </span>
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          </Space>
        </div>
      </div>
    ),
  }));

  return (
    <Card>
      <Title level={4}>{content.title}</Title>
      <Paragraph type="secondary">
        {content.steps.length} steps will be included in the video
      </Paragraph>
      <Collapse items={collapseItems} defaultActiveKey={['0']} />
    </Card>
  );
};

export default VideoPreview;
