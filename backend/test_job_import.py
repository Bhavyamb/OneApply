import unittest

from main import extract_job_details_from_html


class JobImportTest(unittest.TestCase):
    def test_extracts_basic_job_metadata_from_html(self):
        html = '''
        <html>
          <head>
            <title>Senior Frontend Engineer - React</title>
            <meta property="og:title" content="Senior Frontend Engineer" />
            <meta property="og:site_name" content="ExampleCo" />
            <meta name="description" content="Build user-facing features in React and TypeScript" />
          </head>
          <body>
            <div>Remote · India</div>
          </body>
        </html>
        '''

        result = extract_job_details_from_html(html, 'https://www.linkedin.com/jobs/view/123')

        self.assertEqual(result['title'], 'Senior Frontend Engineer')
        self.assertEqual(result['company'], 'ExampleCo')
        self.assertEqual(result['location'], 'Remote')
        self.assertIn('linkedin.com', result['notes'])


if __name__ == '__main__':
    unittest.main()
