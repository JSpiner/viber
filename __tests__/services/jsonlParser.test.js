const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock fs and os modules
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    stat: jest.fn()
  },
  createReadStream: jest.fn()
}));
jest.mock('os');

// Mock readline
jest.mock('readline', () => ({
  createInterface: jest.fn()
}));

// Mock home directory before requiring JSONLParser
os.homedir = jest.fn().mockReturnValue('/Users/test');

const JSONLParser = require('../../src/services/jsonlParser');

describe('JSONLParser', () => {
  let parser;
  
  beforeEach(() => {
    parser = new JSONLParser();
    jest.clearAllMocks();
  });

  describe('scanProjects', () => {
    it('should scan project directories correctly', async () => {
      // Mock directory listing
      fs.readdir.mockResolvedValueOnce([
        '-Users-test-project1',
        '-Users-test-project2',
        'not-a-directory.txt'
      ]);
      
      // Mock stat calls
      fs.stat
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ isDirectory: () => false });
      
      // Mock scanProjectSessions
      parser.scanProjectSessions = jest.fn()
        .mockResolvedValueOnce([
          { projectName: '/Users/test/project1', sessionId: 'session-1', filePath: '/path/to/session-1.jsonl' }
        ])
        .mockResolvedValueOnce([
          { projectName: '/Users/test/project2', sessionId: 'session-2', filePath: '/path/to/session-2.jsonl' }
        ]);
      
      const result = await parser.scanProjects();
      
      expect(result).toHaveLength(2);
      expect(result[0].projectName).toBe('/Users/test/project1');
      expect(result[1].projectName).toBe('/Users/test/project2');
    });

    it('should handle errors gracefully', async () => {
      fs.readdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      const result = await parser.scanProjects();
      
      expect(result).toEqual([]);
    });
  });

  describe('scanProjectSessions', () => {
    it('should scan JSONL files in a project', async () => {
      const projectPath = '/Users/test/.claude/projects/-Users-test-project1';
      const projectName = '-Users-test-project1';
      
      fs.readdir.mockResolvedValueOnce([
        'session-1.jsonl',
        'session-2.jsonl',
        'other-file.txt'
      ]);
      
      const result = await parser.scanProjectSessions(projectPath, projectName);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        projectName: '/Users/test/project1',
        sessionId: 'session-1',
        filePath: path.join(projectPath, 'session-1.jsonl')
      });
      expect(result[1]).toEqual({
        projectName: '/Users/test/project1',
        sessionId: 'session-2',
        filePath: path.join(projectPath, 'session-2.jsonl')
      });
    });
  });

  describe('extractTokenUsage', () => {
    it('should extract token usage from assistant messages', () => {
      const messages = [
        {
          type: 'user',
          message: { role: 'user', content: 'Hello' }
        },
        {
          type: 'assistant',
          timestamp: '2025-07-28T10:00:00.000Z',
          sessionId: 'session-1',
          message: {
            model: 'claude-opus-4-20250514',
            usage: {
              input_tokens: 100,
              output_tokens: 200,
              cache_creation_input_tokens: 300,
              cache_read_input_tokens: 400
            }
          },
          requestId: 'req-1',
          uuid: 'uuid-1'
        },
        {
          type: 'system',
          message: { content: 'System message' }
        },
        {
          type: 'assistant',
          timestamp: '2025-07-28T11:00:00.000Z',
          sessionId: 'session-1',
          message: {
            model: 'claude-sonnet-4-20250514',
            usage: {
              input_tokens: 150,
              output_tokens: 250
            }
          },
          requestId: 'req-2',
          uuid: 'uuid-2'
        }
      ];
      
      const result = parser.extractTokenUsage(messages);
      
      expect(result).toHaveLength(2);
      
      // First message
      expect(result[0]).toEqual({
        timestamp: '2025-07-28T10:00:00.000Z',
        sessionId: 'session-1',
        model: 'claude-opus-4-20250514',
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          cacheCreateTokens: 300,
          cacheReadTokens: 400,
          total: 1000
        },
        requestId: 'req-1',
        uuid: 'uuid-1'
      });
      
      // Second message
      expect(result[1]).toEqual({
        timestamp: '2025-07-28T11:00:00.000Z',
        sessionId: 'session-1',
        model: 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: 150,
          outputTokens: 250,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          total: 400
        },
        requestId: 'req-2',
        uuid: 'uuid-2'
      });
    });

    it('should handle missing usage data', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            model: 'claude-opus-4-20250514',
            // No usage field
          }
        },
        {
          type: 'assistant',
          message: {
            // No model or usage
            usage: {
              input_tokens: 100
            }
          },
          timestamp: '2025-07-28T10:00:00.000Z',
          sessionId: 'session-1'
        }
      ];
      
      const result = parser.extractTokenUsage(messages);
      
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe('unknown');
    });

    it('should return empty array for no assistant messages', () => {
      const messages = [
        { type: 'user', message: { content: 'Hello' } },
        { type: 'system', message: { content: 'System' } }
      ];
      
      const result = parser.extractTokenUsage(messages);
      
      expect(result).toEqual([]);
    });
  });
});