const prisma = require("../config/prisma");
const {
  autoDelegateUndelegatedSubmissions,
} = require("./delegation.service");

function reconcileUndelegatedSubmissions(groupId) {
  autoDelegateUndelegatedSubmissions({ groupId })
    .then((summary) => {
      if (summary.delegated > 0) {
        console.log(
          `Automatically delegated ${summary.delegated} existing submission(s) for group ${groupId}.`,
        );
      }
    })
    .catch((error) => {
      console.error(
        `Group automatic-delegation reconciliation failed for ${groupId}:`,
        error?.message || error,
      );
    });
}

async function assignAssistantToGroup({ assistantId, groupId }) {
  const assistant = await prisma.user.findUnique({ where: { id: assistantId } });
  if (!assistant || assistant.role !== "ASSISTANT") {
    throw { status: 400, msg: "assistantId must reference an ASSISTANT (heads included — they're still assistants)" };
  }
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw { status: 404, msg: "Group not found" };

  const existing = await prisma.assistantGroupAssignment.findUnique({
    where: { assistantId_groupId: { assistantId, groupId } },
  });
  if (existing) throw { status: 400, msg: "Assistant is already assigned to this group" };

  const assignment = await prisma.assistantGroupAssignment.create({
    data: { assistantId, groupId },
  });

  reconcileUndelegatedSubmissions(groupId);
  return assignment;
}

async function unassignAssistantFromGroup({ assistantId, groupId }) {
  const assignment = await prisma.assistantGroupAssignment.delete({
    where: { assistantId_groupId: { assistantId, groupId } },
  });

  reconcileUndelegatedSubmissions(groupId);
  return assignment;
}

async function listGroupsForAssistant(assistantId) {
  return prisma.assistantGroupAssignment.findMany({
    where: { assistantId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          yearId: true,
          year: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
}

async function listAssistantsForGroup(groupId) {
  return prisma.assistantGroupAssignment.findMany({
    where: { groupId },
    include: { assistant: { select: { id: true, name: true, email: true, isHeadAssistant: true } } },
  });
}

/**
 * Used by ticket routing (Phase 3): given a student, find the assistant assigned to
 * their group. If a group has multiple assistants assigned, returns the first —
 * revisit this if Mr. Nagy wants a specific tie-breaking rule (round robin, etc.)
 * once we get to building tickets.
 */
async function getAssignedAssistantForStudent(studentId) {
  const membership = await prisma.groupMembership.findFirst({
    where: { studentId },
    include: { group: { include: { assistantAssignments: { include: { assistant: true } } } } },
  });
  if (!membership) return null;
  const assignments = membership.group.assistantAssignments;
  return assignments.length > 0 ? assignments[0].assistant : null;
}

module.exports = {
  assignAssistantToGroup,
  unassignAssistantFromGroup,
  listGroupsForAssistant,
  listAssistantsForGroup,
  getAssignedAssistantForStudent,
};
