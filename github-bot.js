const { Probot } = require('probot');
const parseDiff = require('./parseDiff'); // You need to implement this function to parse the diff and blame information

const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({
    baseUrl: 'https://your-github-enterprise-url/api/v3',
    auth: 'YOUR_GITHUB_ACCESS_TOKEN', // Replace with your GitHub access token
});


const app = (robot) => {
    robot.on('pull_request.opened', async (context) => {
        const pullRequest = context.payload.pull_request;
        const repoFullName = context.payload.repository.full_name;
        const pullRequestId = pullRequest.number;
        const creator = pullRequest.user.login;

        try {
            // Get the diff and blame information for the pull request
            const diff = await getDiffForPullRequest(repoFullName, pullRequestId);
            const files = parseDiff(diff); // Implement this function to parse the diff and extract file information
            const blames = {}; // Implement this function to get blame information for each file

            // Call the algorithm function to guess reviewers
            const reviewers = guessOwnersForPullRequest(files, blames, creator);

            // Mention the reviewers in the pull request description or comments
            const reviewComment = `@${reviewers.join(' @')} Please review this pull request.`;
            await context.github.issues.createComment({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                issue_number: pullRequestId,
                body: reviewComment,
            });
        } catch (error) {
            console.error('Error occurred while processing the pull request:', error);
        }
    });
};

// Replace the functions below with the actual implementations

async function getDiffForPullRequest(repoFullName, pullRequestId) {
    // const octokit = new Octokit();
    const { data } = await octokit.pulls.get({
        owner: repoFullName.split('/')[0],
        repo: repoFullName.split('/')[1],
        pull_number: pullRequestId,
    });

    return data.diff;
}

async function guessOwnersForPullRequest(files, blames, creator) {
    // Create two empty maps: DeletedLines for authors of deleted lines and AllLines for authors of lines in the changed files.
    const deletedLines = new Map();
    const allLines = new Map();

    // Filling the data structures
    for (const file of files) {
        if (file.status === 'modified' || file.status === 'removed') {
            // If a line was deleted or modified, find the author in the blame and increase its count by one in the DeletedLines map.
            const fileBlame = blames[file.filename] || [];
            for (const hunk of file.hunks) {
                for (const line of hunk.lines) {
                    if (line.type === 'del' || line.type === 'normal') {
                        const author = fileBlame[line.oldLineNumber - 1];
                        if (author && author !== creator) {
                            deletedLines.set(author, (deletedLines.get(author) || 0) + 1);
                        }
                    }
                }
            }
        }

        // If the file was changed, find the author in the blame and increase its count by one in the AllLines map.
        if (file.status !== 'removed') {
            const fileBlame = blames[file.filename] || [];
            for (const hunk of file.hunks) {
                for (const line of hunk.lines) {
                    if (line.type === 'add' || line.type === 'normal') {
                        const author = fileBlame[line.newLineNumber - 1];
                        if (author && author !== creator) {
                            allLines.set(author, (allLines.get(author) || 0) + 1);
                        }
                    }
                }
            }
        }
    }

    // Since getting the blame information is expensive, we sort the files by the number of deleted lines and only pick the top 5.
    const sortedDeletedLines = new Map([...deletedLines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5));
    const sortedAllLines = new Map([...allLines.entries()].sort((a, b) => b[1] - a[1]));

    // Delete names that appear in both maps to avoid mentioning the same person twice.
    for (const [name] of sortedDeletedLines) {
        sortedAllLines.delete(name);
    }

    // Merge DeletedLines with AllLines and take the first three names.
    const mergedMap = new Map([...sortedDeletedLines, ...sortedAllLines]);
    const reviewers = Array.from(mergedMap.keys()).slice(0, 3);

    return reviewers;
}

// The rest of the code remains the same as before

module.exports = app;


module.exports = app;
