import assert from "node:assert/strict";
import {
    DIDASYNC_BLOCK_END_MARKER,
    DIDASYNC_BLOCK_START_MARKER,
    parseDidaSyncBlocks,
    parseDidaSyncBlockConfig,
    replaceDidaSyncBlockContent
} from "../src/taskNoteBlock";

{
    const parsed = parseDidaSyncBlockConfig('{"range":"2026-01-01~2026-12-31","projects":["project1","id:abc"]}');
    assert.equal(parsed.error, undefined);
    assert.deepEqual(parsed.range, {
        type: "custom",
        startDate: "2026-01-01",
        endDate: "2026-12-31"
    });
    assert.deepEqual(parsed.projectKeys, ["name:project1", "id:abc"]);
}

{
    const parsed = parseDidaSyncBlockConfig('{"range":"2026-06-17"}');
    assert.equal(parsed.error, undefined);
    assert.deepEqual(parsed.range, {
        type: "day",
        startDate: "2026-06-17",
        endDate: "2026-06-17"
    });
}

{
    const parsed = parseDidaSyncBlockConfig('{"range":"2026-12-31~2026-01-01"}');
    assert.equal(parsed.error, undefined);
    assert.deepEqual(parsed.range, {
        type: "custom",
        startDate: "2026-01-01",
        endDate: "2026-12-31"
    });
}

{
    const parsed = parseDidaSyncBlockConfig("{bad json");
    assert.equal(parsed.error, "Invalid didasync JSON");
}

{
    const parsed = parseDidaSyncBlockConfig('{"range":"2026-99-99"}');
    assert.equal(parsed.error, "Invalid didasync range");
}

{
    const lines = [
        "# Project",
        '> [!didasync] {"range":"2026-01-01~2026-12-31","projects":["project1"]}',
        "> old handwritten line",
        "",
        '> [!didasync] {"range":"2026-06-17"}',
        `> ${DIDASYNC_BLOCK_START_MARKER}`,
        "> - [ ] old task",
        `> ${DIDASYNC_BLOCK_END_MARKER}`,
        "> trailing line"
    ];

    const blocks = parseDidaSyncBlocks(lines);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].lineIndex, 1);
    assert.equal(blocks[0].isCallout, true);
    assert.equal(blocks[0].insertIndex, 2);
    assert.equal(blocks[1].lineIndex, 4);
    assert.equal(blocks[1].startMarkerIndex, 5);
    assert.equal(blocks[1].endMarkerIndex, 7);

    const replaced = replaceDidaSyncBlockContent(lines, blocks[1], ["> - [ ] new task"]);
    assert.deepEqual(replaced.slice(4, 9), [
        '> [!didasync] {"range":"2026-06-17"}',
        `> ${DIDASYNC_BLOCK_START_MARKER}`,
        "> - [ ] new task",
        `> ${DIDASYNC_BLOCK_END_MARKER}`,
        "> trailing line"
    ]);
}

{
    const lines = [
        "> [!todo]",
        '> [!todo] {"range":"2026-06-17"}',
        "> old task",
        '> [!didasync] {"range":"2026-06-18"}'
    ];
    const blocks = parseDidaSyncBlocks(lines, "> [!todo]");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].lineIndex, 1);
    assert.equal(blocks[0].isCallout, true);
    assert.equal(blocks[0].range.startDate, "2026-06-17");
    assert.equal(blocks[1].lineIndex, 3);
    assert.equal(blocks[1].range.startDate, "2026-06-18");
}

{
    const lines = [
        '## Tasks {"range":"2026-06-17"}',
        "<!-- didasync:start -->",
        "- [ ] old task",
        "<!-- didasync:end -->",
        "## Next"
    ];
    const blocks = parseDidaSyncBlocks(lines, "## Tasks");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].isCallout, false);
    assert.equal(blocks[0].startMarkerIndex, 1);
    assert.equal(blocks[0].endMarkerIndex, 3);

    const replaced = replaceDidaSyncBlockContent(lines, blocks[0], ["- [ ] new task"]);
    assert.deepEqual(replaced.slice(0, 5), [
        '## Tasks {"range":"2026-06-17"}',
        DIDASYNC_BLOCK_START_MARKER,
        "- [ ] new task",
        DIDASYNC_BLOCK_END_MARKER,
        "## Next"
    ]);
}

console.log("taskNoteBlock tests passed");
