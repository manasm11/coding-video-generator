import React, { useState } from 'react';
import {
  Form,
  Input,
  Select,
  Slider,
  Button,
  Card,
  Space,
  Typography,
} from 'antd';
import {
  PlayCircleOutlined,
  EyeOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import type { GenerateRequest } from '../types';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface PromptFormProps {
  onGenerate: (request: GenerateRequest) => void;
  onPreview: (prompt: string) => void;
  loading: boolean;
  previewLoading: boolean;
}

const languageOptions = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
];

const styleOptions = [
  { value: 'beginner', label: 'Beginner Friendly' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const PromptForm: React.FC<PromptFormProps> = ({
  onGenerate,
  onPreview,
  loading,
  previewLoading,
}) => {
  const [form] = Form.useForm();
  const [prompt, setPrompt] = useState('');

  const handleGenerate = (values: GenerateRequest) => {
    onGenerate(values);
  };

  const handlePreview = () => {
    if (prompt.trim()) {
      onPreview(prompt);
    }
  };

  return (
    <Card>
      <Title level={4}>
        <CodeOutlined /> Create Tutorial Video
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Enter a prompt describing the coding tutorial you want to generate
      </Text>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleGenerate}
        initialValues={{
          language: 'javascript',
          style: 'beginner',
          voiceSpeed: 1.0,
        }}
      >
        <Form.Item
          name="prompt"
          label="Tutorial Prompt"
          rules={[{ required: true, message: 'Please enter a tutorial prompt' }]}
        >
          <TextArea
            rows={4}
            placeholder="e.g., Create a tutorial on JavaScript array methods like map, filter, and reduce with practical examples"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Form.Item>

        <Space style={{ width: '100%' }} size="large">
          <Form.Item name="language" label="Programming Language" style={{ minWidth: 200 }}>
            <Select options={languageOptions} />
          </Form.Item>

          <Form.Item name="style" label="Difficulty Level" style={{ minWidth: 200 }}>
            <Select options={styleOptions} />
          </Form.Item>
        </Space>

        <Form.Item name="voiceSpeed" label="Narration Speed">
          <Slider
            min={0.5}
            max={1.5}
            step={0.1}
            marks={{
              0.5: 'Slow',
              1.0: 'Normal',
              1.5: 'Fast',
            }}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="default"
              icon={<EyeOutlined />}
              onClick={handlePreview}
              loading={previewLoading}
              disabled={!prompt.trim()}
            >
              Preview Content
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              htmlType="submit"
              loading={loading}
            >
              Generate Video
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default PromptForm;
