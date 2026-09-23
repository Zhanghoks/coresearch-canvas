import { AppError } from "./errors.js";

// 数据库有 check (source_entity_id <> target_entity_id)，这里提前给出 400，而不是让它变成 500。
export function assertNotSelfRelation(input: { sourceEntityId: string; targetEntityId: string }) {
    if (input.sourceEntityId === input.targetEntityId) throw new AppError("研究关系不能指向自身", 400, "relation_self_reference");
}
