// User-defined equivalences for deduplication
// Users can add node/relation equivalences that the AI should recognize

export interface UserEquivalences {
  nodes: Record<string, string[]>;
  relations: Record<string, string[]>;
}

export const defaultEquivalences: UserEquivalences = {
  // Node equivalences  
  nodes: {
    "Teig": ["Dough", "Pasta", "Batter", "teig"],
    "Ofen": ["Oven", "Backofen", "oven"],
    "Mehl": ["Flour", "Weizenmehl", "flour"],
    "Weizenmehl": ["Mehl", "Flour", "weizenmehl"],
    "Backofen": ["Ofen", "Oven", "backofen"],
  },
  
  // Relation equivalences  
  relations: {
    "PART_OF": ["CONTAINS", "INCLUDES", "HAS_COMPONENT"],
    "USES": ["REQUIRES", "NEEDS", "EMPLOYS"],
    "PRODUCES": ["CREATES", "GENERATES", "MAKES"],
    "IS_A": ["TYPE_OF", "INSTANCE_OF", "KIND_OF"],
  }
};